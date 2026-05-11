#!/usr/bin/env node
'use strict';

/**
 * fetch-opengnt.js
 *
 * Downloads OpenGNT data from eliranwong/OpenGNT and prepares it for tokenization.
 *
 * This script:
 *   1. Fetches OpenGNT.csv.zip from GitHub
 *   2. Extracts and caches locally
 *   3. Parses into word→Strong's mappings
 *
 * Usage:
 *   node scripts/fetch-opengnt.js
 *
 * Output:
 *   scripts/cache/OpenGNT.csv
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CACHE_DIR = 'scripts/cache';
const OPENGNT_ZIP_URL = 'https://github.com/eliranwong/OpenGNT/raw/master/OpenGNT.csv.zip';
const OPENGNT_ZIP_FILE = path.join(CACHE_DIR, 'OpenGNT.csv.zip');
const OPENGNT_CSV_FILE = path.join(CACHE_DIR, 'OpenGNT.csv');

// ---------------------------------------------------------------------------
// HTTP download helper
// ---------------------------------------------------------------------------

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        fs.unlink(outputPath, () => {});
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(outputPath);
      });
    });

    request.on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Unzip helper (using system unzip)
// ---------------------------------------------------------------------------

function unzipFile(zipPath, outputDir) {
  try {
    execSync(`unzip -o "${zipPath}" -d "${outputDir}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Failed to unzip: ${error.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('📥 OpenGNT Data Fetcher\n');

  // Create cache directory
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // Check if already cached
  if (fs.existsSync(OPENGNT_CSV_FILE)) {
    console.log(`✓ OpenGNT.csv already cached at ${OPENGNT_CSV_FILE}\n`);
    return;
  }

  console.log(`📦 Downloading OpenGNT.csv.zip from GitHub...`);
  console.log(`   URL: ${OPENGNT_ZIP_URL}\n`);

  try {
    await downloadFile(OPENGNT_ZIP_URL, OPENGNT_ZIP_FILE);
    console.log(`✓ Downloaded to ${OPENGNT_ZIP_FILE}\n`);

    console.log(`🔧 Extracting OpenGNT.csv.zip...\n`);
    const success = unzipFile(OPENGNT_ZIP_FILE, CACHE_DIR);

    if (!success) {
      console.error('\n❌ Extraction failed. Make sure `unzip` is installed.\n');
      process.exit(1);
    }

    // Verify extraction
    if (!fs.existsSync(OPENGNT_CSV_FILE)) {
      console.error(`\n❌ Expected file not found: ${OPENGNT_CSV_FILE}\n`);
      process.exit(1);
    }

    const fileSize = fs.statSync(OPENGNT_CSV_FILE).size;
    console.log(`✓ Extracted OpenGNT.csv (${(fileSize / 1024 / 1024).toFixed(2)} MB)\n`);

    console.log('✅ OpenGNT data ready for tokenization!\n');
    console.log('Next: Run `node scripts/tokenize-with-strongs.js`\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

main();
