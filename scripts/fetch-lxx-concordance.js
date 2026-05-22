#!/usr/bin/env node
'use strict';

/**
 * fetch-lxx-concordance.js
 *
 * Builds lexicons/strongs-lxx-concordance.json from the STEPBible-Data LXXM
 * file (CC BY 4.0, https://github.com/STEPBible/STEPBible-Data).
 *
 * The output has the same format as strongs-nt-concordance.json:
 *   { "G746": ["genesis.1.1", "exodus.3.14", ...], ... }
 *
 * Verse IDs use the same book.chapter.verse keys as the NET translation so
 * that verseIdToRef() and TranslationsModule.getVerseText() work without
 * modification.
 *
 * Psalms note: The LXX numbers Psalms differently from the MT/Hebrew OT.
 * The STEPBible LXXM file uses LXX verse numbering.  The NET Bible follows
 * MT/Hebrew verse numbering.  For most Psalms this is off by one (LXX Ps 9
 * = MT Ps 9+10, LXX Ps 10–145 = MT Ps 11–146, etc.).  To keep the
 * concordance aligned with the NET we apply MT normalisation below.
 *
 * Usage:
 *   node scripts/fetch-lxx-concordance.js
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// STEPBible LXXM source
// ---------------------------------------------------------------------------

const STEPBIBLE_BASE = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/';

// Possible filenames (try each in order)
const LXXM_CANDIDATES = [
  'LXXM%2BLXXBo%20-%20LXX%2Bmorphology%2BBreton.txt',
  'LXXM%2BLXXBo%20-%20LXX%2Bmorphology%2BBreton%20(TXT).txt',
  'Tagged-Bibles/LXXM%2BLXXBo%20-%20LXX%2Bmorphology%2BBreton.txt',
];

// ---------------------------------------------------------------------------
// Book abbreviation → canonical lowercase key used in NET verse IDs
// ---------------------------------------------------------------------------

const BOOK_ABBR_MAP = {
  // Standard OT abbreviations (STEPBible / SBL style)
  'Gen':  'genesis',      'Exod': 'exodus',       'Exo':  'exodus',
  'Lev':  'leviticus',    'Num':  'numbers',       'Numb': 'numbers',
  'Deut': 'deuteronomy',  'Deu':  'deuteronomy',
  'Josh': 'joshua',       'Jos':  'joshua',
  'Judg': 'judges',       'Jdg':  'judges',        'Jud':  'judges',
  'Ruth': 'ruth',         'Rut':  'ruth',
  '1Sam': '1samuel',      '1Sa':  '1samuel',       '1Sm':  '1samuel',
  '2Sam': '2samuel',      '2Sa':  '2samuel',       '2Sm':  '2samuel',
  '1Kgs': '1kings',       '1Ki':  '1kings',        '1Kin': '1kings',
  '2Kgs': '2kings',       '2Ki':  '2kings',        '2Kin': '2kings',
  '1Chr': '1chronicles',  '1Ch':  '1chronicles',
  '2Chr': '2chronicles',  '2Ch':  '2chronicles',
  'Ezra': 'ezra',         'Ezr':  'ezra',
  'Neh':  'nehemiah',
  'Esth': 'esther',       'Est':  'esther',
  'Job':  'job',
  'Ps':   'psalms',       'Psa':  'psalms',        'Pss':  'psalms',
  'Prov': 'proverbs',     'Pro':  'proverbs',
  'Eccl': 'ecclesiastes', 'Ecc':  'ecclesiastes',  'Qoh':  'ecclesiastes',
  'Song': 'songofsolomon','Sol':  'songofsolomon',  'SoS':  'songofsolomon',
  'Cant': 'songofsolomon',
  'Isa':  'isaiah',
  'Jer':  'jeremiah',
  'Lam':  'lamentations',
  'Ezek': 'ezekiel',      'Eze':  'ezekiel',
  'Dan':  'daniel',
  'Hos':  'hosea',
  'Joel': 'joel',         'Joe':  'joel',
  'Amos': 'amos',         'Amo':  'amos',
  'Obad': 'obadiah',      'Oba':  'obadiah',
  'Jon':  'jonah',
  'Mic':  'micah',
  'Nah':  'nahum',
  'Hab':  'habakkuk',
  'Zeph': 'zephaniah',    'Zep':  'zephaniah',
  'Hag':  'haggai',
  'Zech': 'zechariah',    'Zec':  'zechariah',
  'Mal':  'malachi',
  // Deuterocanonical books in LXX (not in Protestant OT — skip these)
  'Tob':  null, 'Jdt': null, '1Macc': null, '2Macc': null, '3Macc': null,
  '4Macc': null, 'Wis': null, 'Sir': null, 'Bar': null, 'PrAzar': null,
  'Sus': null, 'Bel': null, '1Esd': null, '2Esd': null, 'PrMan': null,
  'EpJer': null, 'Ps151': null, 'OdesSol': null,
};

// ---------------------------------------------------------------------------
// LXX → MT Psalm number normalisation
//
// The LXX merges or splits several Psalms differently from the MT:
//   LXX Ps 9         = MT Ps 9 + 10  (LXX combines both into one)
//   LXX Ps 10–112    = MT Ps 11–113  (offset −1 after the merge)
//   LXX Ps 113       = MT Ps 114+115 (LXX combines both)
//   LXX Ps 114       = MT Ps 116:1–9
//   LXX Ps 115       = MT Ps 116:10–19
//   LXX Ps 116–145   = MT Ps 117–146
//   LXX Ps 146       = MT Ps 147:1–11
//   LXX Ps 147       = MT Ps 147:12–20
//   LXX Ps 148–150   = MT Ps 148–150
//
// For simplicity we apply a piecewise shift.  Verse numbering within the
// shifted Psalms is preserved as-is (it differs slightly but is close enough
// for concordance display purposes).
// ---------------------------------------------------------------------------

function lxxPsalmToMT(lxxNum) {
  const n = parseInt(lxxNum, 10);
  if (isNaN(n)) return lxxNum;
  if (n <= 8)   return n;          // Ps 1–8: identical
  if (n === 9)  return 9;          // Keep as 9 (MT 9 material)
  if (n >= 10 && n <= 112) return n + 1;  // MT = LXX + 1
  if (n === 113) return 114;       // MT 114 (first part)
  if (n === 114) return 116;       // MT 116 (first half)
  if (n === 115) return 116;       // MT 116 (second half — same chapter)
  if (n >= 116 && n <= 145) return n + 1;  // MT = LXX + 1
  if (n === 146) return 147;
  if (n === 147) return 147;       // MT 147 second half
  return n;                        // 148–150: identical
}

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
// Parser for STEPBible LXXM TSV format
//
// Header/comment lines start with $$ or ===.
// Data lines are tab-separated; the first column is the verse reference in
// formats like:  Gen.1.1  or  Gen 1:1  or  Gen_1:1
// The Strong's column contains a G-number optionally with extended suffix
// (G1722a → G1722) or wrapped in braces ({G1722}).
// ---------------------------------------------------------------------------

function parseRef(rawRef) {
  // Normalise separators: Gen.1.1 / Gen 1:1 / Gen_1:1 → ['Gen', '1', '1']
  const s = rawRef.trim().replace(/[._:\s]+/g, ' ');
  const parts = s.split(' ');
  if (parts.length < 3) return null;
  const [abbr, ch, v] = parts;
  const book = BOOK_ABBR_MAP[abbr];
  if (book === undefined) return null; // unknown abbreviation
  if (book === null) return null;      // deuterocanonical — skip

  let chapter = ch;
  let verse = v.replace(/[^0-9]/g, ''); // strip trailing letters (e.g. "1a")

  if (book === 'psalms') {
    chapter = String(lxxPsalmToMT(ch));
  }

  return `${book}.${chapter}.${verse}`;
}

function parseStrongsNum(raw) {
  if (!raw) return null;
  // Strip braces: {G1722} → G1722
  let s = raw.trim().replace(/[{}]/g, '');
  // Strip extended suffix: G1722a → G1722
  s = s.replace(/^(G\d+)[a-z]$/, '$1');
  if (!s.startsWith('G') || !/^G\d+$/.test(s)) return null;
  return s;
}

function parseLXXM(text) {
  const concordance = {};
  let headerDone = false;
  let refCol = 0;
  let strongsCol = -1;
  let linesParsed = 0;
  let linesSkipped = 0;

  for (const line of text.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    // Skip comment / metadata lines
    if (trimmed.startsWith('$$') || trimmed.startsWith('===')) continue;

    const cols = trimmed.split('\t');

    // First non-comment line that contains 'Strongs' or 'Strong' is the header
    if (!headerDone) {
      const lc = trimmed.toLowerCase();
      if (lc.includes('strongs') || lc.includes('strong') || lc.includes('ref')) {
        // Find which column is Strongs
        for (let i = 0; i < cols.length; i++) {
          const h = cols[i].trim().toLowerCase();
          if (h === 'strongs' || h === 'strong' || h === 'strongsref' || h === 'strong_number') {
            strongsCol = i;
          }
          if (h === 'ref' || h === 'reference') {
            refCol = i;
          }
        }
        if (strongsCol === -1) {
          // Try column index 2 as default (common in STEPBible format)
          strongsCol = 2;
        }
        headerDone = true;
        continue;
      }
      // If this line has enough columns and looks like data, treat col 0 as ref, col 2 as strongs
      if (cols.length >= 3 && /^[A-Z][a-z]{0,3}[. _]/.test(trimmed)) {
        headerDone = true; // treat as first data line with default column layout
      }
    }

    if (!headerDone) continue;
    if (cols.length < 3) { linesSkipped++; continue; }

    const verseId = parseRef(cols[refCol] || '');
    if (!verseId) { linesSkipped++; continue; }

    // Strongs may be in the explicit column or we try columns 2 and 3
    const rawStrongs = cols[strongsCol] || cols[2] || cols[3] || '';
    const sn = parseStrongsNum(rawStrongs);
    if (!sn) { linesSkipped++; continue; }

    if (!concordance[sn]) concordance[sn] = [];
    const arr = concordance[sn];
    if (arr[arr.length - 1] !== verseId) arr.push(verseId); // dedupe consecutive
    linesParsed++;
  }

  return { concordance, linesParsed, linesSkipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const root = path.resolve(__dirname, '..');
  const lexDir = path.join(root, 'lexicons');
  const cacheDir = path.join(__dirname, 'cache');

  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  if (!fs.existsSync(lexDir)) fs.mkdirSync(lexDir, { recursive: true });

  const cacheFile = path.join(cacheDir, 'lxxm.txt');

  let rawText;

  if (fs.existsSync(cacheFile)) {
    console.log(`Using cached LXX file: ${cacheFile}`);
    rawText = fs.readFileSync(cacheFile, 'utf8');
  } else {
    console.log('Fetching STEPBible LXX morphology data from GitHub...');
    let fetched = false;
    let lastErr;
    for (const candidate of LXXM_CANDIDATES) {
      const url = STEPBIBLE_BASE + candidate;
      console.log(`  Trying: ${url}`);
      try {
        rawText = await fetchText(url);
        fs.writeFileSync(cacheFile, rawText, 'utf8');
        console.log(`  ✓ Fetched ${(rawText.length / 1024 / 1024).toFixed(1)} MB, cached to ${cacheFile}`);
        fetched = true;
        break;
      } catch (err) {
        lastErr = err;
        console.log(`  ✗ ${err.message}`);
      }
    }
    if (!fetched) {
      console.error(`\nFailed to fetch LXX data: ${lastErr?.message}`);
      console.error('You can manually download the STEPBible LXXM file and save it to:');
      console.error(`  ${cacheFile}`);
      console.error('Then re-run this script.');
      process.exit(1);
    }
  }

  console.log('\nParsing LXX morphology data...');
  const { concordance, linesParsed, linesSkipped } = parseLXXM(rawText);

  const numKeys = Object.keys(concordance).length;
  const numVerseRefs = Object.values(concordance).reduce((s, a) => s + a.length, 0);
  console.log(`  Parsed: ${linesParsed} word entries`);
  console.log(`  Skipped: ${linesSkipped} (deuterocanonical or unrecognised)`);
  console.log(`  Strong's keys: ${numKeys}`);
  console.log(`  Total verse references: ${numVerseRefs}`);

  if (numKeys === 0) {
    console.error('\nNo concordance data was produced. The file format may not match the expected STEPBible TSV layout.');
    console.error('First 5 lines of cached file:');
    rawText.split('\n').slice(0, 5).forEach(l => console.error('  ' + l));
    process.exit(1);
  }

  const outPath = path.join(lexDir, 'strongs-lxx-concordance.json');
  fs.writeFileSync(outPath, JSON.stringify(concordance) + '\n', 'utf8');
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\nWritten: ${outPath} (${kb} KB)`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
