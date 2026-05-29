#!/usr/bin/env node
'use strict';

/**
 * build-lexicons.js
 *
 * Builds all lexicon files the Basileian Reader needs.
 *
 * Sources:
 *   - `strongs` npm package  → Strong's G/H-number definitions (strongs-index.json)
 *   - lexicons/wh-tokens.json (produced by ingest-wh.js)
 *                            → per-token Strong's + morph for WH/RP2005 verses
 *
 * Outputs:
 *   lexicons/strongs-index.json  — { "G746": { number, lemma, definition } }
 *   lexicons/verse-words.json    — { "mark.1.1": [{text, strongs?, gloss?}], … }
 *
 * Every word in verse-words.json derives its Strong's number directly from the
 * WH 1881 token layer (wh-tokens.json).  There is no lemma-matching fallback;
 * if a verse is not in wh-tokens.json its words will appear without Strong's
 * numbers in the interlinear view.
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
// Build Strong's index from the `strongs` npm package
// ---------------------------------------------------------------------------

function buildStrongsIndex() {
  let strongsPkg;
  try {
    strongsPkg = require('strongs');
  } catch (e) {
    console.error('❌ The `strongs` npm package is not installed.');
    console.error('   Run: npm install strongs');
    process.exit(1);
  }

  const strongsIndex = {};

  for (const [key, val] of Object.entries(strongsPkg)) {
    if (!key.startsWith('G') && !key.startsWith('H')) continue;
    strongsIndex[key] = {
      number: key,
      lemma: val.lemma || '',
      definition: [val.strongs_def, val.kjv_def].filter(Boolean).join(' | ') || key,
    };
  }

  console.log(`✓ Built Strong's index: ${Object.keys(strongsIndex).length} entries`);
  return strongsIndex;
}

// Build a gloss map: Strong's number → first KJV gloss word
function buildGlossMap(strongsIndex) {
  const map = {};
  for (const [key, entry] of Object.entries(strongsIndex)) {
    if (!key.startsWith('G')) continue;
    const kjvPart = entry.definition.split(' | ')[1] || '';
    const firstGloss = kjvPart.split(/[,(]/)[0].trim();
    if (firstGloss) map[key] = firstGloss;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Build verse-words map from WH token layer only
// ---------------------------------------------------------------------------

function buildVerseWordsMap(glossMap) {
  const whTokensPath = path.join(LEXICONS_DIR, 'wh-tokens.json');
  if (!fs.existsSync(whTokensPath)) {
    console.error('❌ lexicons/wh-tokens.json not found. Run ingest-wh.js first.');
    process.exit(1);
  }
  const whTokens = JSON.parse(fs.readFileSync(whTokensPath, 'utf8'));
  console.log(`  WH token layer: ${Object.keys(whTokens).length} verse entries`);

  const verseWords = {};
  let totalVerses = 0;
  let wordsWithStrongs = 0;
  let totalWords = 0;
  let whCovered = 0;
  let noWHCoverage = 0;

  for (const tierFile of TIER_FILES) {
    if (!fs.existsSync(tierFile)) continue;
    const data = JSON.parse(fs.readFileSync(tierFile, 'utf8'));
    const language = data.language || 'grc';

    // Skip Coptic — no Strong's for Sahidic
    if (language === 'cop') continue;

    for (const pericope of data.pericopes || []) {
      for (const verse of pericope.verses || []) {
        if (!verse.verse_id || !verse.text) continue;
        totalVerses++;

        const whEntry = whTokens[verse.verse_id];
        if (whEntry) {
          // Authoritative WH-source token data
          const words = whEntry.map(t => {
            const entry = { text: t.token };
            if (t.strongs) {
              entry.strongs = t.strongs;
              const gloss = glossMap[t.strongs];
              if (gloss) entry.gloss = gloss;
            }
            return entry;
          });
          verseWords[verse.verse_id] = words;
          whCovered++;
          totalWords += words.length;
          wordsWithStrongs += words.filter(w => w.strongs).length;
        } else {
          // No WH token coverage — emit words without Strong's so the
          // interlinear can still show Greek text, just without numbers.
          noWHCoverage++;
          const words = verse.text.trim().split(/\s+/).filter(Boolean).map(w => ({ text: w }));
          verseWords[verse.verse_id] = words;
          totalWords += words.length;
        }
      }
    }
  }

  const pct = totalWords > 0 ? Math.round(wordsWithStrongs / totalWords * 100) : 0;
  console.log(`✓ Verse-words map: ${Object.keys(verseWords).length} verses`);
  console.log(`  WH token layer: ${whCovered} verses (Strong's available)`);
  console.log(`  No WH coverage: ${noWHCoverage} verses (Greek text shown, no Strong's numbers)`);
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

  const strongsIndex = buildStrongsIndex();
  const glossMap = buildGlossMap(strongsIndex);

  console.log('\n📖 Building verse-words from WH token layer...');
  const verseWords = buildVerseWordsMap(glossMap);

  console.log('\n💾 Writing lexicon files...');
  writeJSON(path.join(LEXICONS_DIR, 'strongs-index.json'), strongsIndex);
  writeJSON(path.join(LEXICONS_DIR, 'verse-words.json'), verseWords);

  console.log('\n✅ Done.');
}

main();
