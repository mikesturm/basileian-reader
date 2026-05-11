#!/usr/bin/env node
'use strict';

/**
 * tokenize-with-strongs.js
 *
 * Tokenizes the Basileian corpus Greek text and augments it with:
 *   - Individual word tokens
 *   - Strong's numbers from OpenGNT mappings
 *   - Lemma forms
 *   - Morphological analysis codes (if available)
 *
 * Usage:
 *   node scripts/tokenize-with-strongs.js
 *
 * Requires:
 *   - OpenGNT.csv (from eliranwong/OpenGNT)
 *   - Corpus JSON files (tier*.json)
 *
 * Output:
 *   - Updated tier*.json files with word-level data
 *   - lexicons/word-strongs-map.json (form → Strong's number)
 *   - lexicons/strongs-definitions.json (Strong's → definition)
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OPENGNT_CSV = 'scripts/cache/OpenGNT_version3_3.csv';
const CORPUS_DIR = '.';
const LEXICONS_DIR = 'lexicons';
const TIER_FILES = [
  'tier1_a_mark.json',
  'tier1_b_q.json',
  'tier1_c_special_l.json',
  'tier1_d_special_m.json',
  'tier1_e_thomas.json',
  'tier1_f_john.json',
  'tier2_a_last_supper.json',
  'tier2_b_appearances.json',
  'tier2_c_pauline_claims.json',
  'tier2_d_ascension.json',
  'tier2_e_agraphon.json',
  'tier2_f_didache.json',
  'tier3_a_egerton.json',
  'tier3_b_poxy_1224.json',
  'tier3_c_poxy_840.json',
  'tier3_d_poxy_5575.json',
  'tier3_e_gospel_of_peter.json',
  'tier3_f_jewish_christian.json'
];

// ---------------------------------------------------------------------------
// Load and parse OpenGNT CSV
// ---------------------------------------------------------------------------

function loadOpenGNTMappings() {
  if (!fs.existsSync(OPENGNT_CSV)) {
    console.warn(`⚠ OpenGNT.csv not found at ${OPENGNT_CSV}`);
    console.warn('  Skipping Strong\'s number integration.');
    return { wordMap: {}, definitions: {} };
  }

  console.log('📖 Loading OpenGNT mappings...');
  const csv = fs.readFileSync(OPENGNT_CSV, 'utf8');
  const lines = csv.split('\n').filter(line => line.trim());

  const wordMap = {};       // word (unaccented) → Strong's number
  const definitions = {};   // Strong's number → definition
  const lemmaMap = {};      // lemma → Strong's number

  // OpenGNT_BASE_TEXT.csv column layout (tab-delimited):
  // [0] OGNTsort  [1] TANTTsort  [2] FEATURESsort1  [3] LevinsohnClauseID
  // [4] BGBsort|LTsort|STsort  [5] Book|Chapter|Verse
  // [6] OGNTk|OGNTu|OGNTa|lexeme|sn|rmac  (pipe-delimited compound)
  // [7] BDAG|EDNT|Mounce|GK|LN  ...

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const compound = cols[6]?.trim();
    if (!compound) continue;
    const parts = compound.split('|');
    // parts: [OGNTk, OGNTu, OGNTa, lexeme, sn, rmac]
    const greekWord = parts[1]?.trim();  // OGNTu = unaccented form
    const lemma = parts[3]?.trim();      // lexeme
    let strongs = parts[4]?.trim();      // sn = Extended Strong's (e.g. G3056a)

    if (!strongs) continue;
    // Normalize extended Strong's to base G-number (strip trailing letter)
    strongs = strongs.replace(/([A-Z]\d+)[a-z]$/, '$1');

    if (greekWord && strongs) {
      if (!wordMap[greekWord]) {
        wordMap[greekWord] = strongs;
      }
      if (lemma) {
        lemmaMap[lemma] = strongs;
      }
    }
  }

  console.log(`✓ Loaded ${Object.keys(wordMap).length} word→Strong's mappings`);
  console.log(`✓ Loaded ${Object.keys(lemmaMap).length} lemma→Strong's mappings`);

  return { wordMap, lemmaMap, definitions };
}

// ---------------------------------------------------------------------------
// Greek text normalization
// ---------------------------------------------------------------------------

function normalizeGreekWord(word) {
  // Remove accents and breathing marks, convert to lowercase
  // Returns unaccented, lowercase form
  if (!word) return '';
  
  // Map of accented → unaccented
  const accentMap = {
    'ά': 'α', 'ὰ': 'α', 'ᾳ': 'α', 'ᾶ': 'α', 'ᾴ': 'α', 'ᾷ': 'α', 'ᾲ': 'α', 'ᾱ': 'α',
    'é': 'ε', 'έ': 'ε', 'ὲ': 'ε', 'ῆ': 'η', 'ή': 'η', 'ὴ': 'η', 'ῃ': 'η', 'ῄ': 'η', 'ῇ': 'η', 'ῂ': 'η',
    'ί': 'ι', 'ὶ': 'ι', 'ῖ': 'ι', 'ῒ': 'ι', 'ῌ': 'η', 'ΐ': 'ι',
    'ό': 'ο', 'ὸ': 'ο',
    'ύ': 'υ', 'ὺ': 'υ', 'ῦ': 'υ', 'ῢ': 'υ', 'ῡ': 'υ',
    'ώ': 'ω', 'ὼ': 'ω', 'ῶ': 'ω', 'ῴ': 'ω', 'ῷ': 'ω', 'ῲ': 'ω',
    'ἀ': 'α', 'ἁ': 'α', 'ἂ': 'α', 'ἃ': 'α', 'ἄ': 'α', 'ἅ': 'α', 'ἆ': 'α', 'ἇ': 'α',
    'ἐ': 'ε', 'ἑ': 'ε', 'ἒ': 'ε', 'ἓ': 'ε', 'ἔ': 'ε', 'ἕ': 'ε',
    'ἠ': 'η', 'ἡ': 'η', 'ἢ': 'η', 'ἣ': 'η', 'ἤ': 'η', 'ἥ': 'η', 'ἦ': 'η', 'ἧ': 'η',
    'ἰ': 'ι', 'ἱ': 'ι', 'ἲ': 'ι', 'ἳ': 'ι', 'ἴ': 'ι', 'ἵ': 'ι', 'ἶ': 'ι', 'ἷ': 'ι',
    'ὀ': 'ο', 'ὁ': 'ο', 'ὂ': 'ο', 'ὃ': 'ο', 'ὄ': 'ο', 'ὅ': 'ο',
    'ὐ': 'υ', 'ὑ': 'υ', 'ὒ': 'υ', 'ὓ': 'υ', 'ὔ': 'υ', 'ὕ': 'υ', 'ὖ': 'υ', 'ὗ': 'υ',
    'ὠ': 'ω', 'ὡ': 'ω', 'ὢ': 'ω', 'ὣ': 'ω', 'ὤ': 'ω', 'ὥ': 'ω', 'ὦ': 'ω', 'ὧ': 'ω',
    'ᾀ': 'α', 'ᾁ': 'α', 'ᾂ': 'α', 'ᾃ': 'α', 'ᾄ': 'α', 'ᾅ': 'α', 'ᾆ': 'α', 'ᾇ': 'α',
    'ᾈ': 'α', 'ᾉ': 'α', 'ᾊ': 'α', 'ᾋ': 'α', 'ᾌ': 'α', 'ᾍ': 'α', 'ᾎ': 'α', 'ᾏ': 'α',
    'ᾐ': 'η', 'ᾑ': 'η', 'ᾒ': 'η', 'ᾓ': 'η', 'ᾔ': 'η', 'ᾕ': 'η', 'ᾖ': 'η', 'ᾗ': 'η',
    'ᾘ': 'η', 'ᾙ': 'η', 'ᾚ': 'η', 'ᾛ': 'η', 'ᾜ': 'η', 'ᾝ': 'η', 'ᾞ': 'η', 'ᾟ': 'η',
    'ᾠ': 'ω', 'ᾡ': 'ω', 'ᾢ': 'ω', 'ᾣ': 'ω', 'ᾤ': 'ω', 'ᾥ': 'ω', 'ᾦ': 'ω', 'ᾧ': 'ω',
    'ᾨ': 'ω', 'ᾩ': 'ω', 'ᾪ': 'ω', 'ᾫ': 'ω', 'ᾬ': 'ω', 'ᾭ': 'ω', 'ᾮ': 'ω', 'ᾯ': 'ω',
    'ᾰ': 'α', 'ᾱ': 'α',
    'ῐ': 'ι', 'ῑ': 'ι',
    'ῠ': 'υ', 'ῡ': 'υ',
    'Ά': 'α', 'Έ': 'ε', 'Ή': 'η', 'Ί': 'ι', 'Ό': 'ο', 'Ύ': 'υ', 'Ώ': 'ω',
    'ΐ': 'ι', 'ΰ': 'υ',
    'ϊ': 'ι', 'ϋ': 'υ'
  };

  let normalized = word.toLowerCase();
  for (const [accented, unaccented] of Object.entries(accentMap)) {
    normalized = normalized.split(accented).join(unaccented);
  }

  // Remove remaining diacritics (breathing, iota subscript)
  normalized = normalized
    .replace(/[ἀ-ἇ]/g, 'α')
    .replace(/[ὀ-ὕ]/g, (m) => {
      const chars = { 'ὀ': 'ο', 'ὐ': 'υ', 'ὑ': 'υ' };
      return chars[m] || m;
    });

  return normalized;
}

// ---------------------------------------------------------------------------
// Tokenize verse text
// ---------------------------------------------------------------------------

function tokenizeVerse(verseText, wordMap, lemmaMap) {
  if (!verseText) return [];

  // Split on whitespace and punctuation
  const words = verseText.split(/[\s\[\]]+/).filter(w => w.length > 0);

  return words.map(word => {
    // Handle bracketed variants [word]
    let cleanWord = word.replace(/[\[\]]/g, '');
    const normalized = normalizeGreekWord(cleanWord);

    let token = {
      text: cleanWord,
      normalized: normalized
    };

    // Look up in word map
    if (wordMap[normalized]) {
      token.strongs = wordMap[normalized];
    } else if (lemmaMap[normalized]) {
      token.strongs = lemmaMap[normalized];
    }

    return token;
  });
}

// ---------------------------------------------------------------------------
// Process corpus files
// ---------------------------------------------------------------------------

function processCorpus(wordMap, lemmaMap) {
  console.log('\n🔤 Tokenizing corpus...');

  let totalVerses = 0;
  let versesWithStrongs = 0;

  for (const tierFile of TIER_FILES) {
    const filePath = path.join(CORPUS_DIR, tierFile);
    if (!fs.existsSync(filePath)) {
      console.log(`⊘ ${tierFile} not found (skipping)`);
      continue;
    }

    console.log(`\n📄 Processing ${tierFile}...`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (data.pericopes) {
      for (const pericope of data.pericopes) {
        if (pericope.verses) {
          for (const verse of pericope.verses) {
            totalVerses++;

            // Only tokenize Greek text (language field in parent or assumed)
            if (data.language === 'grc' && verse.text) {
              const tokens = tokenizeVerse(verse.text, wordMap, lemmaMap);
              
              // Count verses that have at least one Strong's mapping
              const withStrongs = tokens.filter(t => t.strongs).length;
              if (withStrongs > 0) {
                versesWithStrongs++;
              }

              // Add tokens array to verse
              verse.words = tokens;
            }
          }
        }
      }
    }

    // Write updated file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated ${filePath}`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Total verses processed: ${totalVerses}`);
  console.log(`  Verses with Strong's mappings: ${versesWithStrongs}`);
}

// ---------------------------------------------------------------------------
// Save lexicon files
// ---------------------------------------------------------------------------

function saveLexicons(wordMap, lemmaMap) {
  if (!fs.existsSync(LEXICONS_DIR)) {
    fs.mkdirSync(LEXICONS_DIR, { recursive: true });
  }

  // Save word→Strong's map
  const wordStrongsPath = path.join(LEXICONS_DIR, 'word-strongs-map.json');
  fs.writeFileSync(wordStrongsPath, JSON.stringify(wordMap, null, 2) + '\n', 'utf8');
  console.log(`\n✓ Saved ${Object.keys(wordMap).length} word mappings to ${wordStrongsPath}`);

  // Save lemma→Strong's map
  const lemmaStrongsPath = path.join(LEXICONS_DIR, 'lemma-strongs-map.json');
  fs.writeFileSync(lemmaStrongsPath, JSON.stringify(lemmaMap, null, 2) + '\n', 'utf8');
  console.log(`✓ Saved ${Object.keys(lemmaMap).length} lemma mappings to ${lemmaStrongsPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('🔧 Basileian Corpus Tokenizer with Strong\'s Numbers\n');

  const { wordMap, lemmaMap, definitions } = loadOpenGNTMappings();

  if (Object.keys(wordMap).length === 0) {
    console.warn('\n⚠ No mappings loaded. Please ensure OpenGNT.csv is available.');
    console.warn('  You can download it from: https://github.com/eliranwong/OpenGNT\n');
  }

  processCorpus(wordMap, lemmaMap);
  saveLexicons(wordMap, lemmaMap);

  console.log('\n✅ Tokenization complete!\n');
  console.log('Next steps:');
  console.log('  1. Update app.js to use verse.words array for rendering');
  console.log('  2. Render words with data-strongs attributes:');
  console.log('     <span class="source-word" data-strongs="G3056">λόγος</span>');
  console.log('  3. Users can click words to view Strong\'s definitions\n');
}

main();
