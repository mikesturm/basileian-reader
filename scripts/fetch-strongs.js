#!/usr/bin/env node
'use strict';

/**
 * fetch-strongs.js
 *
 * Downloads MorphGNT's SBLGNT morphology data from GitHub and extracts:
 *   - lexicons/strongs-grc.json   Greek lemma → Strong's number map
 *   - lexicons/strongs-index.json Strong's number → { number, lemma, definition }
 *
 * MorphGNT column layout (space-delimited within each line):
 *   book/chapter/verse  part-of-speech  parsing-code  text  word  normalised  lemma
 *
 * The SBLGNT repository exposes one file per NT book; we iterate all 27.
 *
 * Usage:
 *   node scripts/fetch-strongs.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// MorphGNT book files (NT only, 27 books in canonical order)
// ---------------------------------------------------------------------------

const MORPHGNT_BASE = 'https://raw.githubusercontent.com/morphgnt/sblgnt/master/data/';

// Book codes used in MorphGNT filenames
const MORPHGNT_BOOKS = [
  '61-Mt-morphgnt.txt', '62-Mk-morphgnt.txt', '63-Lk-morphgnt.txt',
  '64-Jn-morphgnt.txt', '65-Ac-morphgnt.txt', '66-Ro-morphgnt.txt',
  '67-1Co-morphgnt.txt','68-2Co-morphgnt.txt','69-Ga-morphgnt.txt',
  '70-Eph-morphgnt.txt','71-Php-morphgnt.txt','72-Col-morphgnt.txt',
  '73-1Th-morphgnt.txt','74-2Th-morphgnt.txt','75-1Ti-morphgnt.txt',
  '76-2Ti-morphgnt.txt','77-Tit-morphgnt.txt','78-Phm-morphgnt.txt',
  '79-Heb-morphgnt.txt','80-Jas-morphgnt.txt','81-1Pe-morphgnt.txt',
  '82-2Pe-morphgnt.txt','83-1Jn-morphgnt.txt','84-2Jn-morphgnt.txt',
  '85-3Jn-morphgnt.txt','86-Jud-morphgnt.txt','87-Re-morphgnt.txt'
];

// ---------------------------------------------------------------------------
// HTTP helper
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
// MorphGNT parser
//
// Each line has 7 space-separated columns:
//   0  bcv      e.g. "610101" (book 61, chapter 01, verse 01)
//   1  pos      part of speech code
//   2  parsing  morphological parsing code
//   3  text     surface form with punctuation
//   4  word     surface form without punctuation
//   5  norm     normalised surface form
//   6  lemma    dictionary form (used as key)
//
// There is no Strong's number in MorphGNT itself.  We use the lemma as the
// primary lookup key and map it to a synthetic G-number derived from a
// well-known open lexicon where available.  For this script we build a
// lemma-indexed file; the app can surface Strong's numbers if a separate
// strongs mapping is loaded.
// ---------------------------------------------------------------------------

/**
 * Parse one MorphGNT book file and accumulate lemma data into `acc`.
 * acc structure: Map<lemma, { lemma, occurrences, books: Set<string>, pos: Set<string> }>
 */
function parseBook(text, bookCode, acc) {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cols = trimmed.split(/\s+/);
    if (cols.length < 7) continue;

    const pos = cols[1];
    const lemma = cols[6];

    if (!lemma) continue;

    if (!acc.has(lemma)) {
      acc.set(lemma, { lemma, occurrences: 0, books: new Set(), pos: new Set() });
    }
    const entry = acc.get(lemma);
    entry.occurrences++;
    entry.books.add(bookCode);
    entry.pos.add(pos);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const root = path.resolve(__dirname, '..');
  const lexDir = path.join(root, 'lexicons');

  if (!fs.existsSync(lexDir)) {
    fs.mkdirSync(lexDir, { recursive: true });
  }

  console.log('Fetching MorphGNT SBLGNT data\n');

  // Accumulate all lemmas across books
  const acc = new Map();
  let fetched = 0;
  let failed = 0;

  for (const file of MORPHGNT_BOOKS) {
    const url = MORPHGNT_BASE + file;
    const shortName = file.replace('-morphgnt.txt', '');
    process.stdout.write(`  ${shortName.padEnd(12)} ... `);
    try {
      const text = await fetchText(url);
      const linesBefore = acc.size;
      parseBook(text, shortName, acc);
      console.log(`+${acc.size - linesBefore} lemmas`);
      fetched++;
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${fetched} books fetched, ${failed} failed`);
  console.log(`Total unique lemmas: ${acc.size}`);

  // ---------------------------------------------------------------------------
  // Build strongs-grc.json: { lemma: lemma } (identity map for surface lookup)
  // The app uses this to resolve a clicked word to its lemma, then can look up
  // further data.  A future revision can add actual Strong's G-numbers here.
  // ---------------------------------------------------------------------------

  const lemmaMap = {};
  for (const [lemma, data] of acc) {
    lemmaMap[lemma] = {
      lemma,
      occurrences: data.occurrences,
      books: [...data.books].sort(),
      pos: [...data.pos].sort()
    };
  }

  fs.writeFileSync(
    path.join(lexDir, 'strongs-grc.json'),
    JSON.stringify(lemmaMap, null, 2)
  );
  console.log(`\nstrongs-grc.json written (${Object.keys(lemmaMap).length} lemmas)`);

  // ---------------------------------------------------------------------------
  // Build strongs-index.json: same data, indexed the same way but structured
  // for the app's getStrongsDefinition(strongsNum) lookup.  Since MorphGNT
  // does not carry Strong's G-numbers, we use the lemma itself as the key and
  // provide a note pointing the user to external resources.
  // ---------------------------------------------------------------------------

  const index = {};
  for (const [lemma, data] of acc) {
    index[lemma] = {
      lemma,
      occurrences: data.occurrences,
      books: [...data.books].sort(),
      pos: [...data.pos].sort(),
      definition: `[Definition pending] Look up "${lemma}" on Logeion or BlueLetterBible.`,
      external_url: `https://logeion.uchicago.edu/${encodeURIComponent(lemma)}`
    };
  }

  fs.writeFileSync(
    path.join(lexDir, 'strongs-index.json'),
    JSON.stringify(index, null, 2)
  );
  console.log(`strongs-index.json written (${Object.keys(index).length} entries)`);

  if (failed > 0) {
    console.warn(`\nWarning: ${failed} book(s) failed to fetch. Re-run to retry.`);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
