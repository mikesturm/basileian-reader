#!/usr/bin/env node
'use strict';

/**
 * fetch-translations.js
 *
 * Downloads five public-domain Bible translations from GitHub, normalises
 * every verse key to the canonical {book}.{chapter}.{verse} format used
 * throughout the Basileian Reader, and writes the results to
 * translations/{id}.json plus a translations-index.json manifest.
 *
 * Usage:
 *   node scripts/fetch-translations.js
 *
 * Outputs:
 *   translations/kjv.json
 *   translations/asv.json
 *   translations/web.json
 *   translations/ylt.json
 *   translations/darby.json
 *   translations-index.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ---------------------------------------------------------------------------
// Translation source definitions
// ---------------------------------------------------------------------------

const TRANSLATIONS = [
  {
    id: 'kjv',
    name: 'King James Version',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json',
    format: 'scrollmapperCurrent',
    license: 'Public domain'
  },
  {
    id: 'asv',
    name: 'American Standard Version',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ASV.json',
    format: 'scrollmapperCurrent',
    license: 'Public domain'
  },
  {
    id: 'web',
    name: 'World English Bible',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/WEB.json',
    format: 'scrollmapperCurrent',
    license: 'Public domain (World English Bible)'
  },
  {
    id: 'ylt',
    name: "Young's Literal Translation",
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/YLT.json',
    format: 'scrollmapperCurrent',
    license: 'Public domain'
  },
  {
    id: 'darby',
    name: 'Darby Bible Translation',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/Darby.json',
    format: 'scrollmapperCurrent',
    license: 'Public domain'
  }
];

// ---------------------------------------------------------------------------
// Book-name → canonical lowercase key
// Covers all common English abbreviations used by both source formats.
// ---------------------------------------------------------------------------

const BOOK_MAP = {
  // OT
  'GEN': 'genesis',   'Genesis': 'genesis',   'Gen': 'genesis',   'Gn': 'genesis',
  'EXO': 'exodus',    'Exodus': 'exodus',     'Exo': 'exodus',    'Ex': 'exodus',
  'LEV': 'leviticus', 'Leviticus': 'leviticus','Lev': 'leviticus','Lv': 'leviticus',
  'NUM': 'numbers',   'Numbers': 'numbers',   'Num': 'numbers',   'Nu': 'numbers',
  'DEU': 'deuteronomy','Deuteronomy':'deuteronomy','Deut':'deuteronomy','Dt':'deuteronomy',
  'JOS': 'joshua',    'Joshua': 'joshua',     'Josh': 'joshua',   'Jos': 'joshua',
  'JDG': 'judges',    'Judges': 'judges',     'Jdg': 'judges',    'Jg': 'judges',
  'RUT': 'ruth',      'Ruth': 'ruth',         'Ru': 'ruth',
  '1SA': '1samuel',   '1 Samuel': '1samuel',  '1 Sam': '1samuel', '1Sam': '1samuel',
  '2SA': '2samuel',   '2 Samuel': '2samuel',  '2 Sam': '2samuel', '2Sam': '2samuel',
  '1KI': '1kings',    '1 Kings': '1kings',    '1 Kgs': '1kings',  '1Kgs': '1kings',
  '2KI': '2kings',    '2 Kings': '2kings',    '2 Kgs': '2kings',  '2Kgs': '2kings',
  '1CH': '1chronicles','1 Chronicles':'1chronicles','1 Chr':'1chronicles','1Chr':'1chronicles',
  '2CH': '2chronicles','2 Chronicles':'2chronicles','2 Chr':'2chronicles','2Chr':'2chronicles',
  'EZR': 'ezra',      'Ezra': 'ezra',         'Ezr': 'ezra',
  'NEH': 'nehemiah',  'Nehemiah': 'nehemiah', 'Neh': 'nehemiah',
  'EST': 'esther',    'Esther': 'esther',     'Est': 'esther',
  'JOB': 'job',       'Job': 'job',
  'PSA': 'psalms',    'Psalms': 'psalms',     'Psa': 'psalms',    'Ps': 'psalms',
  'PRO': 'proverbs',  'Proverbs': 'proverbs', 'Pro': 'proverbs',  'Pr': 'proverbs',
  'ECC': 'ecclesiastes','Ecclesiastes':'ecclesiastes','Ecc':'ecclesiastes','Ec':'ecclesiastes',
  'SNG': 'songofsolomon','Song of Solomon':'songofsolomon','Song':'songofsolomon','SS':'songofsolomon',
  'ISA': 'isaiah',    'Isaiah': 'isaiah',     'Isa': 'isaiah',    'Is': 'isaiah',
  'JER': 'jeremiah',  'Jeremiah': 'jeremiah', 'Jer': 'jeremiah',
  'LAM': 'lamentations','Lamentations':'lamentations','Lam':'lamentations','La':'lamentations',
  'EZK': 'ezekiel',   'Ezekiel': 'ezekiel',   'Eze': 'ezekiel',   'Ez': 'ezekiel',
  'DAN': 'daniel',    'Daniel': 'daniel',     'Dan': 'daniel',    'Da': 'daniel',
  'HOS': 'hosea',     'Hosea': 'hosea',       'Hos': 'hosea',     'Ho': 'hosea',
  'JOL': 'joel',      'Joel': 'joel',         'Joe': 'joel',      'Jl': 'joel',
  'AMO': 'amos',      'Amos': 'amos',         'Amo': 'amos',      'Am': 'amos',
  'OBA': 'obadiah',   'Obadiah': 'obadiah',   'Oba': 'obadiah',   'Ob': 'obadiah',
  'JON': 'jonah',     'Jonah': 'jonah',       'Jon': 'jonah',     'Jnh': 'jonah',
  'MIC': 'micah',     'Micah': 'micah',       'Mic': 'micah',
  'NAM': 'nahum',     'Nahum': 'nahum',       'Nah': 'nahum',     'Na': 'nahum',
  'HAB': 'habakkuk',  'Habakkuk': 'habakkuk', 'Hab': 'habakkuk',
  'ZEP': 'zephaniah', 'Zephaniah': 'zephaniah','Zep': 'zephaniah','Zp': 'zephaniah',
  'HAG': 'haggai',    'Haggai': 'haggai',     'Hag': 'haggai',    'Hg': 'haggai',
  'ZEC': 'zechariah', 'Zechariah': 'zechariah','Zec': 'zechariah','Zch': 'zechariah',
  'MAL': 'malachi',   'Malachi': 'malachi',   'Mal': 'malachi',   'Ml': 'malachi',
  // NT
  'MAT': 'matthew',   'Matthew': 'matthew',   'Mat': 'matthew',   'Matt': 'matthew',   'Mt': 'matthew',
  'MRK': 'mark',      'Mark': 'mark',         'Mar': 'mark',      'Mrk': 'mark',       'Mk': 'mark',
  'LUK': 'luke',      'Luke': 'luke',         'Luk': 'luke',      'Lk': 'luke',
  'JHN': 'john',      'John': 'john',         'Joh': 'john',      'Jn': 'john',        'Jhn': 'john',
  'ACT': 'acts',      'Acts': 'acts',         'Act': 'acts',      'Ac': 'acts',
  'ROM': 'romans',    'Romans': 'romans',     'Rom': 'romans',    'Ro': 'romans',
  '1CO': '1corinthians','1 Corinthians':'1corinthians','1 Cor':'1corinthians','1Cor':'1corinthians',
  '2CO': '2corinthians','2 Corinthians':'2corinthians','2 Cor':'2corinthians','2Cor':'2corinthians',
  'GAL': 'galatians', 'Galatians': 'galatians','Gal': 'galatians','Ga': 'galatians',
  'EPH': 'ephesians', 'Ephesians': 'ephesians','Eph': 'ephesians','Ep': 'ephesians',
  'PHP': 'philippians','Philippians':'philippians','Php':'philippians','Phi':'philippians',
  'COL': 'colossians','Colossians': 'colossians','Col':'colossians',
  '1TH': '1thessalonians','1 Thessalonians':'1thessalonians','1 Thess':'1thessalonians','1Thess':'1thessalonians',
  '2TH': '2thessalonians','2 Thessalonians':'2thessalonians','2 Thess':'2thessalonians','2Thess':'2thessalonians',
  '1TI': '1timothy',  '1 Timothy': '1timothy','1 Tim': '1timothy','1Tim': '1timothy',
  '2TI': '2timothy',  '2 Timothy': '2timothy','2 Tim': '2timothy','2Tim': '2timothy',
  'TIT': 'titus',     'Titus': 'titus',       'Tit': 'titus',
  'PHM': 'philemon',  'Philemon': 'philemon', 'Phm': 'philemon',  'Phlm': 'philemon',
  'HEB': 'hebrews',   'Hebrews': 'hebrews',   'Heb': 'hebrews',
  'JAS': 'james',     'James': 'james',       'Jam': 'james',     'Jm': 'james',
  '1PE': '1peter',    '1 Peter': '1peter',    '1 Pet': '1peter',  '1Pet': '1peter',
  '2PE': '2peter',    '2 Peter': '2peter',    '2 Pet': '2peter',  '2Pet': '2peter',
  '1JN': '1john',     '1 John': '1john',      '1 Jno': '1john',   '1Jn': '1john',
  '2JN': '2john',     '2 John': '2john',      '2 Jno': '2john',   '2Jn': '2john',
  '3JN': '3john',     '3 John': '3john',      '3 Jno': '3john',   '3Jn': '3john',
  'JUD': 'jude',      'Jude': 'jude',         'Jud': 'jude',
  'REV': 'revelation','Revelation': 'revelation','Rev': 'revelation','Re': 'revelation'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a book name (any casing / abbreviation) to canonical lowercase key.
 * Falls back to stripping non-alphanumeric characters if no mapping exists.
 */
function normalizeBook(raw) {
  if (!raw) return 'unknown';
  const trimmed = raw.trim();
  if (BOOK_MAP[trimmed]) return BOOK_MAP[trimmed];

  // Case-insensitive fallback scan
  const lower = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(BOOK_MAP)) {
    if (key.toLowerCase() === lower) return value;
  }

  // Last resort: strip punctuation and lowercase
  return lower.replace(/[^a-z0-9]/g, '');
}

/** Build the canonical verse_id string. */
function toVerseId(book, chapter, verse) {
  return `${normalizeBook(book)}.${chapter}.${verse}`;
}

/** HTTP GET → Buffer (follows a single redirect). */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const get = (target) => {
      https.get(target, (res) => {
        // Follow one redirect (GitHub raw redirects via CDN)
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

/** Fetch and JSON-parse a URL. */
async function fetchJSON(url) {
  const buf = await fetchBuffer(url);
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`JSON parse failed for ${url}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Format parsers
// ---------------------------------------------------------------------------

/**
 * OpenBibleData format:  { "GEN 1:1": "text", ... }
 * Key pattern: "ABC 1:2" where ABC is a 3-letter USFM book code.
 */
async function parseOpenBibleData(url) {
  const raw = await fetchJSON(url);
  const result = {};
  let skipped = 0;

  for (const [key, text] of Object.entries(raw)) {
    // Accepts patterns like "GEN 1:1", "MAT 3:16", "1CO 13:1"
    const m = key.match(/^([1-9A-Z]{1,3})\s+(\d+):(\d+[a-z]?)$/i);
    if (!m) { skipped++; continue; }
    const [, book, chapter, verse] = m;
    result[toVerseId(book, chapter, verse)] = text;
  }

  if (skipped > 0) console.warn(`    (${skipped} keys skipped – unrecognised format)`);
  return result;
}

/**
 * Scrollmapper format:  { "resultset": { "row": [ { "field": [...] } ] } }
 * or flat array:        [ { "book": "...", "chapter": N, "verse": N, "text": "..." } ]
 *
 * The scrollmapper GitHub JSON files vary; this handles both layouts.
 */
async function parseScrollmapper(url) {
  const raw = await fetchJSON(url);
  const result = {};

  let rows = null;
  const bookById = new Map();

  // Layout 1: current Scrollmapper JSON, e.g. { KJV_books: [...], KJV_verses: [...] }
  if (!Array.isArray(raw) && raw && typeof raw === 'object') {
    const keys = Object.keys(raw);
    const booksKey = keys.find(k => /_books$/i.test(k)) || keys.find(k => /^books$/i.test(k));
    const versesKey = keys.find(k => /_verses$/i.test(k)) || keys.find(k => /^verses$/i.test(k));
    if (booksKey && versesKey && Array.isArray(raw[booksKey]) && Array.isArray(raw[versesKey])) {
      for (const book of raw[booksKey]) {
        const id = book.id ?? book.book_id ?? book.bookId;
        const name = book.name ?? book.book ?? book.title ?? book.book_name;
        if (id !== undefined && name) bookById.set(String(id), name);
      }
      rows = raw[versesKey];
    }
  }

  // Layout 2: top-level array
  if (!rows && Array.isArray(raw)) {
    rows = raw;
  }
  // Layout 3: { resultset: { row: [...] } }
  else if (!rows && raw.resultset && Array.isArray(raw.resultset.row)) {
    rows = raw.resultset.row.map(r => {
      if (Array.isArray(r.field)) {
        return { b: r.field[1], c: r.field[2], v: r.field[3], t: r.field[4] };
      }
      return r;
    });
  }

  if (!rows) {
    console.warn('    Unknown Scrollmapper layout – no verses parsed');
    return result;
  }

  for (const row of rows) {
    const book = row.book || row.book_name || row.bookName || (row.book_id !== undefined ? bookById.get(String(row.book_id)) : null) || (row.bookId !== undefined ? bookById.get(String(row.bookId)) : null);
    const chapter = row.chapter ?? row.c;
    const verse = row.verse ?? row.v;
    const text = row.text ?? row.t ?? row.verse_text ?? '';
    if (book && chapter !== undefined && verse !== undefined) {
      result[toVerseId(book, chapter, verse)] = String(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      continue;
    }
    if (row.b !== undefined && row.c !== undefined && row.v !== undefined) {
      result[toVerseId(String(row.b), row.c, row.v)] = row.t || '';
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const root = path.resolve(__dirname, '..');
  const translationsDir = path.join(root, 'translations');

  if (!fs.existsSync(translationsDir)) {
    fs.mkdirSync(translationsDir, { recursive: true });
  }

  console.log('Fetching Bible translations\n');

  const indexEntries = [];

  for (const trans of TRANSLATIONS) {
    process.stdout.write(`  ${trans.id.padEnd(6)} ${trans.name} ... `);
    try {
      let normalized;
      if (trans.format === 'openbibledata') {
        normalized = await parseOpenBibleData(trans.url);
      } else {
        normalized = await parseScrollmapper(trans.url);
      }

      const count = Object.keys(normalized).length;
      const outPath = path.join(translationsDir, `${trans.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(normalized));
      console.log(`${count} verses`);

      indexEntries.push({
        id: trans.id,
        name: trans.name,
        file: `translations/${trans.id}.json`,
        license: trans.license,
        verse_count: count,
        source_url: trans.url
      });
    } catch (err) {
      console.log(`FAILED — ${err.message}`);
    }
  }

  // Write translations-index.json
  const index = {
    schema_version: '1.0',
    generated: new Date().toISOString(),
    translations: indexEntries
  };

  const indexPath = path.join(root, 'translations-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log('\ntranslations-index.json written');
  console.log('Done.');
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
