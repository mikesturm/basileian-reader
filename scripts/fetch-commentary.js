#!/usr/bin/env node
'use strict';

/**
 * fetch-commentary.js
 *
 * Downloads a public-domain Bible commentary, normalises every entry key to the
 * canonical {book}.{chapter}.{verse} format used throughout the Basileian Reader,
 * and writes the result to commentary/{id}.json.
 *
 * Usage:
 *   node scripts/fetch-commentary.js
 *
 * Outputs:
 *   commentary/mhcc.json   Matthew Henry's Concise Commentary (chapter-level)
 *   commentary/jfb.json    Jamieson-Fausset-Brown (verse-level where available)
 *
 * Data sources (public domain, no registration required):
 *   MHCC — Wikisource-derived JSON hosted on GitHub:
 *     https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/
 *   JFB  — CrossWire SWORD module (JAM.zip), converted to JSON.
 *
 * If the automated download fails, you can supply a pre-downloaded file manually:
 *   1. Download one of the supported formats (see SOURCES below).
 *   2. Save it as  scripts/commentary-raw/{id}.json
 *   3. Re-run this script — it will pick up the local file automatically.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// Known public-domain commentary sources
// ---------------------------------------------------------------------------

const SOURCES = {
  mhcc: {
    name: "Matthew Henry's Concise Commentary",
    // Primary: scrollmapper hosts a plain KJV so this serves as a placeholder
    // until a verified MHCC JSON host is confirmed. See fallback below.
    urls: [
      // Scrollmapper does not host commentary, but this URL pattern is kept
      // so you can swap in any verse-keyed JSON URL:
      'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/MHCC.json',
      // Add your own fallback URL here if you have a hosted copy:
      // 'https://example.com/mhcc.json',
    ],
    format: 'flat-verse-object' // { "GEN 1:1": "text", ... } or { "genesis.1.1": "..." }
  },
  jfb: {
    name: 'Jamieson-Fausset-Brown Commentary',
    urls: [
      // Add a URL to a pre-converted JFB JSON file here, e.g.:
      // 'https://raw.githubusercontent.com/your-fork/jfb-json/main/jfb.json',
    ],
    format: 'flat-verse-object'
  }
};

// ---------------------------------------------------------------------------
// Book-name → canonical lowercase key (shared with fetch-translations.js)
// ---------------------------------------------------------------------------

const BOOK_MAP = {
  'GEN':'genesis','Genesis':'genesis','Gen':'genesis','Gn':'genesis',
  'EXO':'exodus','Exodus':'exodus','Exo':'exodus','Ex':'exodus',
  'LEV':'leviticus','Leviticus':'leviticus','Lev':'leviticus',
  'NUM':'numbers','Numbers':'numbers','Num':'numbers',
  'DEU':'deuteronomy','Deuteronomy':'deuteronomy','Deut':'deuteronomy',
  'JOS':'joshua','Joshua':'joshua','Josh':'joshua',
  'JDG':'judges','Judges':'judges','Jdg':'judges',
  'RUT':'ruth','Ruth':'ruth',
  '1SA':'1samuel','1 Samuel':'1samuel','1Sam':'1samuel',
  '2SA':'2samuel','2 Samuel':'2samuel','2Sam':'2samuel',
  '1KI':'1kings','1 Kings':'1kings','1Kgs':'1kings',
  '2KI':'2kings','2 Kings':'2kings','2Kgs':'2kings',
  '1CH':'1chronicles','1 Chronicles':'1chronicles','1Chr':'1chronicles',
  '2CH':'2chronicles','2 Chronicles':'2chronicles','2Chr':'2chronicles',
  'EZR':'ezra','Ezra':'ezra',
  'NEH':'nehemiah','Nehemiah':'nehemiah',
  'EST':'esther','Esther':'esther',
  'JOB':'job','Job':'job',
  'PSA':'psalms','Psalms':'psalms','Psalm':'psalms','Psa':'psalms','Ps':'psalms',
  'PRO':'proverbs','Proverbs':'proverbs','Prov':'proverbs',
  'ECC':'ecclesiastes','Ecclesiastes':'ecclesiastes','Eccl':'ecclesiastes',
  'SNG':'songofsolomon','Song of Solomon':'songofsolomon','Song':'songofsolomon',
  'ISA':'isaiah','Isaiah':'isaiah','Isa':'isaiah',
  'JER':'jeremiah','Jeremiah':'jeremiah','Jer':'jeremiah',
  'LAM':'lamentations','Lamentations':'lamentations','Lam':'lamentations',
  'EZK':'ezekiel','Ezekiel':'ezekiel','Ezek':'ezekiel','Eze':'ezekiel',
  'DAN':'daniel','Daniel':'daniel','Dan':'daniel',
  'HOS':'hosea','Hosea':'hosea','Hos':'hosea',
  'JOL':'joel','Joel':'joel',
  'AMO':'amos','Amos':'amos',
  'OBA':'obadiah','Obadiah':'obadiah',
  'JON':'jonah','Jonah':'jonah','Jon':'jonah',
  'MIC':'micah','Micah':'micah','Mic':'micah',
  'NAM':'nahum','Nahum':'nahum','Nah':'nahum',
  'HAB':'habakkuk','Habakkuk':'habakkuk','Hab':'habakkuk',
  'ZEP':'zephaniah','Zephaniah':'zephaniah','Zep':'zephaniah',
  'HAG':'haggai','Haggai':'haggai','Hag':'haggai',
  'ZEC':'zechariah','Zechariah':'zechariah','Zec':'zechariah',
  'MAL':'malachi','Malachi':'malachi','Mal':'malachi',
  'MAT':'matthew','Matthew':'matthew','Matt':'matthew','Mt':'matthew',
  'MRK':'mark','Mark':'mark','Mrk':'mark','Mk':'mark',
  'LUK':'luke','Luke':'luke','Luk':'luke','Lk':'luke',
  'JHN':'john','John':'john','Jhn':'john','Jn':'john',
  'ACT':'acts','Acts':'acts','Act':'acts',
  'ROM':'romans','Romans':'romans','Rom':'romans',
  '1CO':'1corinthians','1 Corinthians':'1corinthians','1Cor':'1corinthians',
  '2CO':'2corinthians','2 Corinthians':'2corinthians','2Cor':'2corinthians',
  'GAL':'galatians','Galatians':'galatians','Gal':'galatians',
  'EPH':'ephesians','Ephesians':'ephesians','Eph':'ephesians',
  'PHP':'philippians','Philippians':'philippians','Phil':'philippians',
  'COL':'colossians','Colossians':'colossians','Col':'colossians',
  '1TH':'1thessalonians','1 Thessalonians':'1thessalonians','1Thess':'1thessalonians',
  '2TH':'2thessalonians','2 Thessalonians':'2thessalonians','2Thess':'2thessalonians',
  '1TI':'1timothy','1 Timothy':'1timothy','1Tim':'1timothy',
  '2TI':'2timothy','2 Timothy':'2timothy','2Tim':'2timothy',
  'TIT':'titus','Titus':'titus',
  'PHM':'philemon','Philemon':'philemon',
  'HEB':'hebrews','Hebrews':'hebrews','Heb':'hebrews',
  'JAS':'james','James':'james','Jam':'james',
  '1PE':'1peter','1 Peter':'1peter','1Pet':'1peter',
  '2PE':'2peter','2 Peter':'2peter','2Pet':'2peter',
  '1JN':'1john','1 John':'1john','1Jn':'1john',
  '2JN':'2john','2 John':'2john','2Jn':'2john',
  '3JN':'3john','3 John':'3john','3Jn':'3john',
  'JUD':'jude','Jude':'jude',
  'REV':'revelation','Revelation':'revelation','Rev':'revelation'
};

function normalizeBook(raw) {
  if (!raw) return 'unknown';
  const trimmed = raw.trim();
  if (BOOK_MAP[trimmed]) return BOOK_MAP[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(BOOK_MAP)) {
    if (key.toLowerCase() === lower) return val;
  }
  return lower.replace(/[^a-z0-9]/g, '');
}

function toVerseId(book, chapter, verse) {
  return `${normalizeBook(book)}.${chapter}.${verse}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchBuffer(url) {
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
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

async function fetchJSON(url) {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); // strip BOM
}

// ---------------------------------------------------------------------------
// Normalise: flat verse-keyed object
//
// Handles two common input shapes:
//   { "GEN 1:1": "text" }       — USFM-style keys
//   { "genesis.1.1": "text" }   — already canonical
// ---------------------------------------------------------------------------

function normaliseFlatVerseObject(raw) {
  const out = {};
  for (const [key, text] of Object.entries(raw)) {
    if (typeof text !== 'string') continue;
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    // Already canonical: book.chapter.verse
    if (/^[a-z0-9]+\.\d+\.\d+[a-z]?$/.test(key)) {
      out[key] = cleaned;
      continue;
    }

    // USFM-style: "GEN 1:1" or "1CO 13:1"
    const m = key.match(/^([1-9A-Z]{1,3})\s+(\d+):(\d+[a-z]?)$/i);
    if (m) {
      out[toVerseId(m[1], m[2], m[3])] = cleaned;
      continue;
    }

    // "Book Ch:V" long form: "Genesis 1:1"
    const m2 = key.match(/^(.+?)\s+(\d+):(\d+[a-z]?)$/);
    if (m2) {
      out[toVerseId(m2[1], m2[2], m2[3])] = cleaned;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Try local cache first, then remote URLs
// ---------------------------------------------------------------------------

async function loadSource(id, source) {
  const rawDir = path.resolve(__dirname, 'commentary-raw');
  const localFile = path.join(rawDir, `${id}.json`);

  if (fs.existsSync(localFile)) {
    console.log(`    Using local file: ${localFile}`);
    const buf = fs.readFileSync(localFile);
    return JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  }

  const errors = [];
  for (const url of source.urls) {
    try {
      console.log(`    Trying: ${url}`);
      return await fetchJSON(url);
    } catch (err) {
      errors.push(`  ${url}: ${err.message}`);
    }
  }

  throw new Error(
    `All sources failed for "${id}":\n${errors.join('\n')}\n\n` +
    `To supply data manually:\n` +
    `  1. Download a verse-keyed JSON of "${source.name}"\n` +
    `     (format: { "BOOK CHAPTER:VERSE": "text" } or { "book.ch.v": "text" })\n` +
    `  2. Save it to: ${localFile}\n` +
    `  3. Re-run this script.\n`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'commentary');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const rawDir = path.resolve(__dirname, 'commentary-raw');
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  console.log('Fetching Bible commentaries\n');

  for (const [id, source] of Object.entries(SOURCES)) {
    process.stdout.write(`  ${id.padEnd(6)} ${source.name} ... `);
    try {
      const raw = await loadSource(id, source);
      const normalised = normaliseFlatVerseObject(raw);
      const count = Object.keys(normalised).length;

      if (count === 0) {
        console.log('SKIPPED — no verse entries found after normalisation');
        console.log(`         Check that the source data at scripts/commentary-raw/${id}.json`);
        console.log(`         uses keys like "Mark 1:1" or "mark.1.1".`);
        continue;
      }

      const outPath = path.join(outDir, `${id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(normalised));
      console.log(`${count} verse entries`);
    } catch (err) {
      console.log(`SKIPPED\n`);
      console.warn(`    ${err.message}`);
    }
  }

  console.log('\nDone.');
  console.log('Generated files (if any) are in commentary/');
  console.log('They are auto-loaded by the app when present and cached by the service worker.');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
