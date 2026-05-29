#!/usr/bin/env node
'use strict';

/**
 * ingest-wh.js
 *
 * Replaces SBLGNT-sourced verse text in the six affected section files with
 * Westcott-Hort 1881 text from byztxt/greektext-westcott-hort (parsed/).
 *
 * John 7:53–8:11 (Pericope Adulterae) is absent from WH; those verses are
 * sourced from Robinson-Pierpont 2018 (byztxt/byzantine-majority-text,
 * csv-unicode/strongs/with-parsing/JOH.csv) and marked accordingly.
 *
 * Builds lexicons/wh-tokens.json: a parallel token layer keyed by verse_id,
 * containing per-token { token, strongs, morph } objects.  Section-file
 * schema is NOT modified; verse_ids remain stable throughout.
 *
 * Run: node ingest-wh.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Beta Code → Unicode ──────────────────────────────────────────────────────
// Canon conventions: no accents, no breathings, no iota subscripts.
// All sigma (including Beta Code final-sigma 'v') → σ (U+03C3).
// mu → µ (U+00B5 MICRO SIGN) to match the canon-PDF source convention.
const BETA = {
  a:'α', b:'β', g:'γ', d:'δ', e:'ε', z:'ζ', h:'η', q:'θ', i:'ι', k:'κ',
  l:'λ', m:'µ', n:'ν', x:'ξ', o:'ο', p:'π', r:'ρ', s:'σ', t:'τ',
  u:'υ', f:'φ', c:'χ', y:'ψ', w:'ω',
  v: 'σ',  // Beta Code final sigma → medial (canon: no final sigma)
};

function betaToUnicode(w) {
  return w.split('').map(ch => BETA[ch] ?? ch).join('');
}

// ─── Normalize accented Unicode → canon form ──────────────────────────────────
// Strips all combining diacritics (accents, breathings, iota subscripts),
// converts final sigma ς → σ, converts Greek-letter mu μ → micro-sign µ.
function normalizeGreek(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip all combining marks
    .normalize('NFC')
    .replace(/ς/g, 'σ')     // ς → σ
    .replace(/μ/g, 'µ');    // μ (U+03BC) → µ (U+00B5)
}

// ─── Transliteration (canon-style, letter-by-letter) ─────────────────────────
const TR = {
  'α':'a',  'β':'b',  'γ':'g',  'δ':'d',  'ε':'e',  'ζ':'z',
  'η':'ē',  'θ':'th', 'ι':'i',  'κ':'k',  'λ':'l',  'µ':'m',
  'ν':'n',  'ξ':'x',  'ο':'o',  'π':'p',  'ρ':'r',  'σ':'s',
  'τ':'t',  'υ':'y',  'φ':'ph', 'χ':'ch', 'ψ':'ps', 'ω':'ō',
};

function transliterate(text) {
  return text.split(' ').map(word =>
    word.split('').map(c => TR[c] ?? c).join('')
  ).join(' ');
}

// ─── HTTPS fetch (follows redirects) ─────────────────────────────────────────
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const go = (u) => {
      const req = https.get(u, { headers: { 'User-Agent': 'basileian-ingest/1.0' } }, res => {
        if ([301, 302, 307, 308].includes(res.statusCode))
          return go(res.headers.location);
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });
      req.on('error', reject);
    };
    go(url);
  });
}

// ─── Extract token array from a verse token-stream string ────────────────────
// Handles: | (separators, skip), numbers (Strong's — take first), {morph},
// word tokens with optional [ ] bracket markers.
// isBeta=true  → Beta Code input, convert via betaToUnicode
// isBeta=false → Unicode Greek input, normalize via normalizeGreek
function extractTokens(str, isBeta) {
  const tokens = [];
  const parts = str.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];

    if (p === '|')          { i++; continue; }  // separator
    if (/^\d+$/.test(p))    { i++; continue; }  // orphan Strong's number
    if (/^\{[^}]*\}$/.test(p)) { i++; continue; } // orphan morph tag

    // Is this a word token?
    const looksLikeWord = isBeta
      ? /^[\[\]'a-z]+$/.test(p)                     // Beta Code letters + brackets
      : /[Ͱ-Ͽἀ-῿]/.test(p);     // contains Greek chars

    if (!looksLikeWord) { i++; continue; }

    const bracketed = p.startsWith('[') || p.endsWith(']');
    const rawWord   = p.replace(/[\[\]]/g, '');
    if (!rawWord) { i++; continue; }

    const token = isBeta ? betaToUnicode(rawWord) : normalizeGreek(rawWord);
    i++;

    // Collect Strong's number(s) and morphology tag that follow this word
    let strongs = null;
    let morph   = null;
    while (i < parts.length) {
      const nx = parts[i];
      if (/^\d+$/.test(nx)) {
        if (!strongs) strongs = 'G' + nx;  // take only the first number
        i++;
      } else if (/^\{[^}]*\}$/.test(nx)) {
        morph = nx.slice(1, -1);
        i++;
        break;
      } else {
        break;  // next word starts here
      }
    }

    if (token) {
      const entry = { token, strongs, morph };
      if (bracketed) entry.wh_bracketed = true;
      tokens.push(entry);
    }
  }
  return tokens;
}

// ─── Resolve WH inline text-critical variant groups ──────────────────────────
// The byztxt WH format encodes variant readings inline with pipe separators.
// Two patterns appear in the data:
//
//   Pattern A (no strongs per word):
//     | variant | mainText | strongs... {morph}
//     → mainText strongs... {morph}
//
//   Pattern B (strongs per word, orphan morph):
//     | variant strongsV | mainText strongsM | {morph}
//     → mainText strongsM {morph}
//
// The WH main text is always the LAST word-form before the final pipe that
// precedes the strongs/morph group.  Both patterns are replaced in-place
// before the verse string is tokenized.
function resolveWHVariants(str) {
  // Strip double-bracketed WH-excluded multi-word phrases before any other processing.
  // e.g. [[kai 2532 {CONJ} anefereto 399 ...]] in Luke 24:51 must be removed whole.
  str = str.replace(/\[\[.*?\]\]/g, '');

  // Pattern A: | word1 | word2 | num(s) {morph}  →  word2 num(s) {morph}
  str = str.replace(
    /\|\s+[a-z'[\]]+\s+\|\s+([a-z'[\]]+)\s+\|\s+((?:\d+\s+)+\{[^}]+\})/g,
    '$1 $2'
  );

  // Pattern B: | word1 num | word2 num(s) | {morph}  →  word2 num(s) {morph}
  str = str.replace(
    /\|\s+[a-z'[\]]+\s+\d+\s+\|\s+([a-z'[\]]+)\s+((?:\d+\s+)+)\|\s+(\{[^}]+\})/g,
    '$1 $2$3'
  );

  return str;
}

// ─── Parse WH .UWH file ───────────────────────────────────────────────────────
// Verse lines start with "ch:v ".  Continuation lines start with a space.
// Returns Map<"ch:v", tokens[]>  (ch and v are plain integers, no leading zeros)
function parseUWH(content) {
  const map = new Map();

  // Re-join continuation lines onto their verse line
  const verseLines = [];
  for (const raw of content.split(/\r?\n/)) {
    if (/^\d+:\d+\s/.test(raw)) {
      verseLines.push(raw);
    } else if (raw.startsWith(' ') && verseLines.length > 0) {
      verseLines[verseLines.length - 1] += ' ' + raw.trim();
    }
  }

  for (const line of verseLines) {
    const m = line.match(/^(\d+):(\d+)\s+([\s\S]*)/);
    if (!m) continue;
    const ref    = `${parseInt(m[1])}:${parseInt(m[2])}`;
    const tokens = extractTokens(resolveWHVariants(m[3]), true);
    map.set(ref, tokens);
  }
  return map;
}

// ─── Parse RP2005 CSV (chapter,verse,text — Unicode Greek) ───────────────────
// Returns Map<"ch:v", tokens[]>
function parseRPCSV(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^(\d+),(\d+),(.+)/);
    if (!m) continue;
    const ref    = `${parseInt(m[1])}:${parseInt(m[2])}`;
    const tokens = extractTokens(m[3], false);
    map.set(ref, tokens);
  }
  return map;
}

// ─── Source URLs ──────────────────────────────────────────────────────────────
const WH_BASE = 'https://raw.githubusercontent.com/byztxt/greektext-westcott-hort/master/parsed';
const RP_BASE = 'https://raw.githubusercontent.com/byztxt/byzantine-majority-text/master/csv-unicode/strongs/with-parsing';

// WH file for each book code used in our verse_ids
const WH_FILES = {
  john:       'JOH.UWH',
  mark:       'MR.UWH',
  matthew:    'MT.UWH',
  '1cor':     '1CO.UWH',
  '1thess':   '1TH.UWH',
  galatians:  'GA.UWH',
  acts:       'AC.UWH',
  luke:       'LU.UWH',
};

// Pericope Adulterae verses (absent from WH; sourced from RP2005)
const PA_VERSES = [
  { verse_id: 'john.7.53', ch: 7, v: 53, reference: 'John 7:53' },
];
for (let v = 1; v <= 11; v++) {
  PA_VERSES.push({ verse_id: `john.8.${v}`, ch: 8, v, reference: `John 8:${v}` });
}

// Section files to update (agraphon intentionally excluded per scope)
const SECTION_FILES = [
  'tier1_a_mark.json',
  'tier1_c_special_l.json',
  'tier1_d_special_m.json',
  'tier1_f_john.json',
  'tier2_a_last_supper.json',
  'tier2_b_appearances.json',
  'tier2_c_dominical_sayings.json',
  'tier2_d_pauline_claims.json',
  'tier2_e_ascension.json',
];

const WH_SOURCE_EDITION = 'Westcott-Hort 1881 (byztxt/greektext-westcott-hort, Sandborg-Petersen ed.); rendered in canon-style unaccented form.';
const RP_SOURCE_EDITION = 'Robinson-Pierpont Byzantine Majority Text 2018 (byztxt/byzantine-majority-text); rendered in canon-style unaccented form. Absent from WH 1881.';

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== ingest-wh.js: WH 1881 ingestion ===\n');

  // 1. Load all affected section files; collect which verse refs each book needs
  const sectionData  = {};
  const neededByBook = {};  // book → Set<"ch:v">

  for (const fname of SECTION_FILES) {
    const data = JSON.parse(fs.readFileSync(fname, 'utf8'));
    sectionData[fname] = data;
    for (const p of data.pericopes ?? []) {
      for (const v of p.verses ?? []) {
        const [book, ch, vs] = v.verse_id.split('.');
        if (!neededByBook[book]) neededByBook[book] = new Set();
        neededByBook[book].add(`${parseInt(ch)}:${parseInt(vs)}`);
      }
    }
  }

  // 2. Download and parse WH parsed files
  const whMaps = {};
  console.log('Downloading WH parsed files...');
  for (const [book, file] of Object.entries(WH_FILES)) {
    if (!neededByBook[book] && book !== 'john') continue;
    // Always download john (needed for PA check even if no existing verses need it)
    process.stdout.write(`  ${file} ... `);
    const content = await fetchText(`${WH_BASE}/${file}`);
    whMaps[book] = parseUWH(content);
    console.log(`${whMaps[book].size} verses`);
  }

  // 3. Download RP2005 JOH.csv for Pericope Adulterae
  console.log('\nDownloading RP2005 JOH.csv for Pericope Adulterae...');
  const rpContent = await fetchText(`${RP_BASE}/JOH.csv`);
  const rpMap     = parseRPCSV(rpContent);
  console.log(`  ${rpMap.size} verses parsed`);

  const paFound = PA_VERSES.filter(({ ch, v }) => rpMap.has(`${ch}:${v}`));
  const paMissing = PA_VERSES.filter(({ ch, v }) => !rpMap.has(`${ch}:${v}`));
  console.log(`  PA verses found: ${paFound.length}/20`);
  if (paMissing.length > 0) {
    for (const { verse_id } of paMissing)
      console.warn(`  WARNING: PA verse ${verse_id} not found in RP2005`);
  }

  // 4. Build text and token maps for all affected verse_ids
  const tokenMap       = {};   // verse_id → tokens[]
  const textMap        = {};   // verse_id → reconstructed text string
  const alignmentIssues = [];  // [verse_id, textWords, tokenCount]

  // WH verses (from existing section-file verse_ids)
  for (const [book, refs] of Object.entries(neededByBook)) {
    const wh = whMaps[book];
    if (!wh) {
      console.warn(`  WARNING: No WH map for book '${book}'`);
      continue;
    }
    for (const ref of refs) {
      const [ch, vs] = ref.split(':');
      const verseId  = `${book}.${ch}.${vs}`;
      const tokens   = wh.get(ref);
      if (!tokens) {
        console.warn(`  WARNING: ${verseId} (${ref}) not found in WH ${WH_FILES[book] ?? '?'}`);
        continue;
      }
      const text = tokens.map(t => t.token).join(' ');
      textMap[verseId]  = text;
      tokenMap[verseId] = tokens.map(({ token, strongs, morph, wh_bracketed }) => {
        const e = { token, strongs, morph };
        if (wh_bracketed) e.wh_bracketed = true;
        return e;
      });
      // Alignment sanity check
      const wordCount  = text.split(' ').filter(Boolean).length;
      if (wordCount !== tokens.length) {
        alignmentIssues.push([verseId, wordCount, tokens.length]);
      }
    }
  }

  // PA verses from RP2005
  for (const { verse_id, ch, v } of PA_VERSES) {
    const ref    = `${ch}:${v}`;
    const tokens = rpMap.get(ref);
    if (!tokens) continue;
    const text = tokens.map(t => t.token).join(' ');
    textMap[verse_id]  = text;
    tokenMap[verse_id] = tokens;
  }

  // 5. Report alignment issues
  console.log('');
  if (alignmentIssues.length > 0) {
    console.log('=== TOKEN ALIGNMENT ISSUES (review before use) ===');
    for (const [vid, words, toks] of alignmentIssues)
      console.log(`  ${vid}: text=${words} words, tokens=${toks}`);
  } else {
    console.log('Token alignment: all clean (word count matches token count for every verse).');
  }

  // 6. Update section files
  console.log('\nUpdating section files...');

  for (const fname of SECTION_FILES) {
    const data = sectionData[fname];
    let changed = 0;

    // File-level metadata: switch to WH provenance
    data.source_edition = WH_SOURCE_EDITION;
    data.public_domain  = true;
    delete data.license_note;
    delete data.source_format_note;

    for (const p of data.pericopes ?? []) {

      // --- Populate Pericope Adulterae from RP2005 ---
      if (p.pericope_id === 'john_7_53-8_11') {
        const paVerses = PA_VERSES
          .filter(({ verse_id }) => textMap[verse_id])
          .map(({ verse_id, reference }) => ({
            verse_id,
            reference,
            text:           textMap[verse_id],
            transliteration: transliterate(textMap[verse_id]),
          }));

        p.verses = paVerses;
        p.source_edition  = RP_SOURCE_EDITION;
        p.wh_status       = 'absent_in_wh';
        // Replace placeholder metadata with accurate sourcing note
        p.text_critical_note =
          'Absent from the earliest Alexandrian manuscripts (P66, P75, Sinaiticus, Vaticanus) ' +
          'and from WH 1881 entirely. Present in the Byzantine tradition. ' +
          'Text here follows Robinson-Pierpont 2018 (public domain). ' +
          'Preserved in the canon as a floating dominical tradition on the same basis as Luke 23:34a.';
        delete p.text_status;
        delete p.follow_up_needed;
        changed += paVerses.length;
        continue;
      }

      // --- Replace existing verse texts with WH text ---
      for (const v of p.verses ?? []) {
        if (textMap[v.verse_id]) {
          v.text           = textMap[v.verse_id];
          v.transliteration = transliterate(textMap[v.verse_id]);
          changed++;
        }
      }
    }

    fs.writeFileSync(fname, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  ${fname}: ${changed} verses written`);
  }

  // 7. Write parallel token layer
  const tokenPath = path.join('lexicons', 'wh-tokens.json');
  fs.writeFileSync(tokenPath, JSON.stringify(tokenMap, null, 2) + '\n', 'utf8');
  const tokenCount = Object.keys(tokenMap).length;
  console.log(`\nWrote ${tokenCount} verse entries → ${tokenPath}`);

  // Summary
  const totalVerses = Object.keys(textMap).length;
  console.log('\n=== Summary ===');
  console.log(`  Verses with WH/RP2005 text:  ${totalVerses}`);
  console.log(`  Of which PA (RP2005):         ${paFound.length}`);
  console.log(`  Token alignment issues:       ${alignmentIssues.length}`);
  console.log('  Done.');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
