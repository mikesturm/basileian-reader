#!/usr/bin/env node
'use strict';

/**
 * fetch-ot-concordance.js
 *
 * Builds OT Hebrew concordance data from the STEPBible TAHOT files
 * (Translators Amalgamated Hebrew OT, CC BY 4.0, Tyndale House Cambridge).
 *
 * Source: https://github.com/STEPBible/STEPBible-Data
 *
 * Outputs two files:
 *
 *  lexicons/strongs-ot-concordance.json
 *    { "H1254": ["genesis.1.1", "genesis.1.21", ...], ... }
 *    Same format as strongs-nt-concordance.json but for the Hebrew OT.
 *    Keys use H-prefix Strong's numbers (base numbers, disambiguation
 *    suffixes stripped).
 *
 *  lexicons/ot-verse-strongs.json
 *    { "genesis.1.1": ["H7225","H1254","H0430","H0853","H8064","H0853","H0776"], ... }
 *    Maps each OT verse to the ordered list of H-prefix root Strong's numbers
 *    (one entry per Hebrew word in the verse, including repeated words).
 *
 * Usage:
 *   node scripts/fetch-ot-concordance.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// TAHOT file sources (CC BY 4.0)
// ---------------------------------------------------------------------------

const BASE = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/';

const TAHOT_FILES = [
  BASE + 'TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  BASE + 'TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  BASE + 'TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
  BASE + 'TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt',
];

// ---------------------------------------------------------------------------
// Book abbreviation → canonical lowercase key matching NET verse IDs
// ---------------------------------------------------------------------------

const BOOK_ABBR_MAP = {
  Gen: 'genesis',    Exo: 'exodus',        Lev: 'leviticus',
  Num: 'numbers',    Deu: 'deuteronomy',   Jos: 'joshua',
  Jdg: 'judges',     Rut: 'ruth',          '1Sa': '1samuel',
  '2Sa': '2samuel',  '1Ki': '1kings',       '2Ki': '2kings',
  '1Ch': '1chronicles', '2Ch': '2chronicles', Ezr: 'ezra',
  Neh: 'nehemiah',   Est: 'esther',        Job: 'job',
  Psa: 'psalms',     Pro: 'proverbs',      Ecc: 'ecclesiastes',
  Sol: 'songofsolomon', Son: 'songofsolomon', Sng: 'songofsolomon',
  Isa: 'isaiah',     Jer: 'jeremiah',      Lam: 'lamentations',
  Eze: 'ezekiel',    Dan: 'daniel',        Hos: 'hosea',
  Joe: 'joel',       Amo: 'amos',          Oba: 'obadiah',
  Jon: 'jonah',      Mic: 'micah',         Nah: 'nahum',
  Hab: 'habakkuk',   Zep: 'zephaniah',     Hag: 'haggai',
  Zec: 'zechariah',  Mal: 'malachi',
};

// ---------------------------------------------------------------------------
// HTTP helper (follows redirects)
// ---------------------------------------------------------------------------

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const get = (target) => {
      https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${target}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

// ---------------------------------------------------------------------------
// Parse one TAHOT file
//
// Data lines look like:
//   Gen.1.1#01=L<TAB>בְּ/רֵאשִׁ֖ית<TAB>be./re.Shit<TAB>in/ beginning<TAB>H9003/{H7225G}<TAB>...
//   Col 0: Ref "Book.Chapter.Verse#word=type"
//   Col 4: dStrongs (disambiguated)
//   Col 8: Root dStrong+Instance (simpler number for each root word)
//
// We use col 8 for the "root" Strong's number which is the cleanest single
// number for each Hebrew word.  We strip disambiguation suffixes like
// G, A, B, C (single letter) and _A, _B (underscore+letter) from the
// H-number to get the canonical H####.
// ---------------------------------------------------------------------------

function parseStrongsRoot(raw) {
  if (!raw) return null;
  // Strip surrounding braces and instance markers, keep only the H-number
  // e.g. H7225G → H7225 ; H1254A → H1254 ; H0853_A → H0853
  const m = raw.match(/H(\d+)/);
  if (!m) return null;
  return 'H' + m[1].replace(/^0+/, '').padStart(4, '0'); // normalise to H#### (4-digit)
}

function parseTAHOT(text, concordance, verseStrongs) {
  let wordCount = 0;
  let prevVerseId = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('\t') || trimmed.startsWith('#') ||
        trimmed.startsWith('=') || trimmed.startsWith('TAHOT') ||
        trimmed.startsWith('Eng')) {
      continue;
    }

    // Data line: first col is Ref like "Gen.1.1#01=L"
    const cols = trimmed.split('\t');
    if (cols.length < 9) continue;

    const refRaw = cols[0].trim();
    // Must start with a known book abbreviation
    const dotIdx = refRaw.indexOf('.');
    if (dotIdx < 0) continue;
    const bookAbbr = refRaw.slice(0, dotIdx);
    if (!BOOK_ABBR_MAP[bookAbbr]) continue;

    // Extract chapter.verse from "Gen.1.1#01=L" → "1.1"
    const hashIdx = refRaw.indexOf('#');
    const cvPart = refRaw.slice(dotIdx + 1, hashIdx > 0 ? hashIdx : undefined);
    if (!cvPart || !cvPart.includes('.')) continue;

    const book = BOOK_ABBR_MAP[bookAbbr];
    const verseId = `${book}.${cvPart}`;

    // Col 8: Root dStrong+Instance e.g. "H7225G" or "H0853_A"
    const rootRaw = cols[8]?.trim() || '';
    const sn = parseStrongsRoot(rootRaw);
    if (!sn) continue;

    // Add to concordance (deduplicate per verse)
    if (!concordance[sn]) concordance[sn] = [];
    const arr = concordance[sn];
    if (arr[arr.length - 1] !== verseId) arr.push(verseId);

    // Add to verse-strongs map
    if (!verseStrongs[verseId]) verseStrongs[verseId] = [];
    verseStrongs[verseId].push(sn);

    wordCount++;
  }

  return wordCount;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const root    = path.resolve(__dirname, '..');
  const lexDir  = path.join(root, 'lexicons');
  const cacheDir = path.join(__dirname, 'cache');

  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(lexDir))   fs.mkdirSync(lexDir, { recursive: true });

  const concordance  = {};   // H-number → [verseId, ...]
  const verseStrongs = {};   // verseId  → [H-number, ...]
  let totalWords = 0;

  for (let i = 0; i < TAHOT_FILES.length; i++) {
    const url = TAHOT_FILES[i];
    const shortName = url.split('/').pop().replace(/%20/g, ' ').replace(/%2B/g, '+').split(' - ')[0];
    const cacheFile = path.join(cacheDir, `tahot_${i}.txt`);

    let text;
    if (fs.existsSync(cacheFile)) {
      process.stdout.write(`  ${shortName}: cached\n`);
      text = fs.readFileSync(cacheFile, 'utf8');
    } else {
      process.stdout.write(`  ${shortName}: fetching... `);
      text = await fetchText(url);
      fs.writeFileSync(cacheFile, text, 'utf8');
      console.log(`ok (${(text.length / 1024).toFixed(0)} KB)`);
    }

    const words = parseTAHOT(text, concordance, verseStrongs);
    console.log(`    +${words} words, ${Object.keys(concordance).length} H-keys so far`);
    totalWords += words;
  }

  console.log(`\nTotal: ${totalWords} words, ${Object.keys(concordance).length} H-keys, ${Object.keys(verseStrongs).length} verses`);

  if (Object.keys(concordance).length === 0) {
    console.error('No data parsed. Check the TAHOT file format.');
    process.exit(1);
  }

  const concPath = path.join(lexDir, 'strongs-ot-concordance.json');
  fs.writeFileSync(concPath, JSON.stringify(concordance) + '\n', 'utf8');
  const concKB = Math.round(fs.statSync(concPath).size / 1024);
  console.log(`\nWritten: ${concPath} (${concKB} KB)`);

  const vsPath = path.join(lexDir, 'ot-verse-strongs.json');
  fs.writeFileSync(vsPath, JSON.stringify(verseStrongs) + '\n', 'utf8');
  const vsKB = Math.round(fs.statSync(vsPath).size / 1024);
  console.log(`Written: ${vsPath} (${vsKB} KB)`);

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
