#!/usr/bin/env node
'use strict';

/**
 * build-lexicons.js
 *
 * Builds all lexicon files the Basileian Reader needs.
 *
 * Sources:
 *   - `strongs` npm package  → Strong's G-number definitions
 *   - lexicons/wh-tokens.json (produced by ingest-wh.js)
 *                            → per-token Strong's + morph for WH/RP2005 verses
 *
 * Outputs:
 *   lexicons/strongs-index.json    — { "G746": { number, lemma, definition } }
 *   lexicons/word-strongs-map.json — { "αρχη": "G746", ... }
 *   lexicons/verse-words.json      — { "mark.1.1": [{text, strongs, gloss}], … }
 *
 * For verses covered by wh-tokens.json (WH 1881 and RP2005 sources), the
 * per-token Strong's data from the WH parsed text is used directly, giving
 * 100% Strong's coverage for those verses.  All other Greek verses fall back
 * to normalised-lemma matching against the strongs npm package.
 *
 * Coptic (Thomas) verses are skipped — no Strong's for Sahidic Coptic.
 *
 * Usage:
 *   node scripts/build-lexicons.js
 */

const fs = require('fs');
const path = require('path');

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
  'tier2_c_dominical_sayings.json',
  'tier2_d_pauline_claims.json',
  'tier2_e_ascension.json',
  'tier2_f_agraphon.json',
  'tier2_g_didache.json',
  'tier3_a_egerton.json',
  'tier3_b_poxy_1224.json',
  'tier3_c_poxy_840.json',
  'tier3_d_poxy_5575.json',
  'tier3_e_gospel_of_peter.json',
  'tier3_f_jewish_christian.json',
];

// ---------------------------------------------------------------------------
// Greek normalisation
// ---------------------------------------------------------------------------

// Map any polytonic / diacritical Greek character to its plain base letter.
// Built by decomposing all Unicode chars in the Greek Extended block (1F00-1FFF)
// and the Combining Diacritical Marks block (0300-036F).
function normalizeGreek(str) {
  if (!str) return '';
  const decomposed = str.normalize('NFD')
    .replace(/[̀-ͯ᷀-᷿⃐-⃿]/g, '');
  return decomposed
    .toLowerCase()
    .replace(/ς/g, 'σ')  // treat final and medial sigma identically
    .replace(/ϲ/g, 'σ'); // OpenGNT uses lunate sigma ϲ (U+03F2)
}

// ---------------------------------------------------------------------------
// Build Strong's index and lemma map from the `strongs` npm package
// ---------------------------------------------------------------------------

function buildFromStrongsPackage() {
  let strongsPkg;
  try {
    strongsPkg = require('strongs');
  } catch (e) {
    console.error('❌ The `strongs` npm package is not installed.');
    console.error('   Run: npm install strongs');
    process.exit(1);
  }

  const strongsIndex = {};   // G-number → { number, lemma, definition, kjv }
  const wordStrongsMap = {}; // normalised word form → G-number

  for (const [key, val] of Object.entries(strongsPkg)) {
    if (!key.startsWith('G') && !key.startsWith('H')) continue;

    const entry = {
      number: key,
      lemma: val.lemma || '',
      definition: [val.strongs_def, val.kjv_def].filter(Boolean).join(' | ') || key,
    };
    strongsIndex[key] = entry;

    // Index by normalised lemma form
    if (val.lemma) {
      const norm = normalizeGreek(val.lemma);
      if (norm && !wordStrongsMap[norm]) {
        wordStrongsMap[norm] = key;
      }
    }
  }

  // Build a fallback gloss map from the KJV portion of each definition.
  // Definition format: "<strongs_def> | <kjv glosses, comma-separated>"
  const fallbackGlossMap = {};
  for (const [key, entry] of Object.entries(strongsIndex)) {
    if (!key.startsWith('G')) continue;
    const kjvPart = entry.definition.split(' | ')[1] || '';
    const firstGloss = kjvPart.split(/[,(]/)[0].trim();
    if (firstGloss) fallbackGlossMap[key] = firstGloss;
  }

  console.log(`✓ Built Strong's index: ${Object.keys(strongsIndex).length} entries`);
  console.log(`✓ Built word→Strong's map: ${Object.keys(wordStrongsMap).length} entries`);
  console.log(`✓ Built fallback gloss map: ${Object.keys(fallbackGlossMap).length} Greek entries`);
  return { strongsIndex, wordStrongsMap, fallbackGlossMap };
}

// ---------------------------------------------------------------------------
// Tokenise corpus tier files → verse-words map
// ---------------------------------------------------------------------------

function tokeniseVerse(text, wordStrongsMap, glossMap) {
  if (!text) return [];
  return text
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(raw => {
      const clean = raw.replace(/^[^Ͱ-Ͽἀ-῿]+|[^Ͱ-Ͽἀ-῿]+$/g, '');
      const norm = normalizeGreek(clean || raw);
      const strongs = wordStrongsMap[norm] || null;
      const token = { text: clean || raw };
      if (strongs) {
        token.strongs = strongs;
        const gloss = glossMap && glossMap[strongs];
        if (gloss) token.gloss = gloss;
      }
      return token;
    });
}

function buildVerseWordsMap(wordStrongsMap, fallbackGlossMap) {
  // Load the WH 1881 / RP2005 token layer produced by ingest-wh.js.
  // For verses covered by this layer, per-token Strong's G-numbers from the
  // WH parsed source are used directly (100% coverage, morph-aware).
  const whTokensPath = path.join(LEXICONS_DIR, 'wh-tokens.json');
  const whTokens = fs.existsSync(whTokensPath)
    ? JSON.parse(fs.readFileSync(whTokensPath, 'utf8'))
    : {};
  const whVerseCoverage = Object.keys(whTokens).length;
  console.log(`  WH token layer: ${whVerseCoverage} verse entries`);

  const verseWords = {};
  let totalVerses = 0;
  let wordsWithStrongs = 0;
  let totalWords = 0;
  let whCovered = 0;

  for (const tierFile of TIER_FILES) {
    if (!fs.existsSync(tierFile)) continue;
    const data = JSON.parse(fs.readFileSync(tierFile, 'utf8'));
    const language = data.language || 'grc';

    // Skip non-Greek sections (Coptic Thomas has no Strong's for Sahidic)
    if (language === 'cop') continue;

    for (const pericope of data.pericopes || []) {
      for (const verse of pericope.verses || []) {
        if (!verse.verse_id || !verse.text) continue;
        totalVerses++;

        let words;
        if (whTokens[verse.verse_id]) {
          // Authoritative WH-source token data: convert to verse-words format
          words = whTokens[verse.verse_id].map(t => {
            const entry = { text: t.token };
            if (t.strongs) {
              entry.strongs = t.strongs;
              const gloss = fallbackGlossMap[t.strongs];
              if (gloss) entry.gloss = gloss;
            }
            return entry;
          });
          whCovered++;
        } else {
          // Lemma-based tokenisation for non-WH-token verses (Mark, Q, etc.)
          words = tokeniseVerse(verse.text, wordStrongsMap, fallbackGlossMap);
        }

        verseWords[verse.verse_id] = words;
        totalWords += words.length;
        wordsWithStrongs += words.filter(w => w.strongs).length;
      }
    }
  }

  const pct = totalWords > 0 ? Math.round(wordsWithStrongs / totalWords * 100) : 0;
  console.log(`✓ Verse-words map: ${Object.keys(verseWords).length} verses`);
  console.log(`  WH token layer used for ${whCovered} verses (100% Strong's coverage)`);
  console.log(`  Overall: ${wordsWithStrongs} / ${totalWords} words with Strong's number (${pct}%)`);

  return verseWords;
}

// ---------------------------------------------------------------------------
// Write output files
// ---------------------------------------------------------------------------

function writeJSON(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
  const kb = Math.round(fs.statSync(filePath).size / 1024);
  console.log(`  → ${filePath} (${kb} KB)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('🔧 Basileian Lexicon Builder\n');

  const { strongsIndex, wordStrongsMap, fallbackGlossMap } = buildFromStrongsPackage();

  console.log('\n📖 Tokenising corpus (WH token layer + lemma fallback)...');
  const verseWords = buildVerseWordsMap(wordStrongsMap, fallbackGlossMap);

  console.log('\n💾 Writing lexicon files...');
  writeJSON(path.join(LEXICONS_DIR, 'strongs-index.json'), strongsIndex);
  writeJSON(path.join(LEXICONS_DIR, 'word-strongs-map.json'), wordStrongsMap);
  writeJSON(path.join(LEXICONS_DIR, 'verse-words.json'), verseWords);

  console.log('\n✅ Done. The app will load word-level Strong\'s data from lexicons/verse-words.json');
}

main();
