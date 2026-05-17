#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../canon.html');
const DEST = path.join(__dirname, '../booklet.html');

// --- Extract and clean source text ---

const raw = fs.readFileSync(SRC, 'utf8');
const preMatch = raw.match(/<pre>([\s\S]*?)<\/pre>/);
if (!preMatch) { console.error('No <pre> block found'); process.exit(1); }

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const content = decodeEntities(preMatch[1]);
const lines = content.split('\n');

// --- Inline markup helpers ---

function markItalics(t) {
  return t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

// Endnote refs: bare digits immediately after a transliteration-gloss ]
// or after a letter/quote and period, or after a letter and colon
// (colon rule requires a letter before it to exclude verse refs like 1:3).
// Comma is intentionally excluded to avoid false positives (e.g. "Codex II,2").
function markEndnoteRefs(t) {
  return t
    // After ] closing a transliteration gloss: ]N  (not followed by digit/dash)
    .replace(/\](\d{1,3})(?=[^\d\-–—]|$)/g, ']<sup><a href="#note-$1">$1</a></sup>')
    // After closing bracket and period: e.g. "failures].8"
    .replace(/\]\.(\d{1,3})(?=[^\d]|$)/g, '].<sup><a href="#note-$1">$1</a></sup>')
    // After closing quote and period: "'word'.N" or '"word".N'
    .replace(/(["\'])\.(\d{1,3})(?=[^\d]|$)/g, '$1.<sup><a href="#note-$2">$2</a></sup>')
    // After 2+ letter word ending and period: e.g. "Anointed.2" but NOT "v.2" (abbreviation)
    .replace(/(?<=[a-zA-Z]{2})\.(\d{1,3})(?=[^\d]|$)/g, '.<sup><a href="#note-$1">$1</a></sup>')
    // After letter and colon: e.g. "prophet:3" — letter before : excludes verse refs (1:3)
    .replace(/([a-zA-Z]):(\d{1,3})(?=[^\d]|$)/g, '$1:<sup><a href="#note-$2">$2</a></sup>')
    // After em-dash: "—N" (em-dashes before digits are always endnote refs in this text)
    .replace(/—(\d{1,3})(?=[^\d]|$)/g, '—<sup><a href="#note-$1">$1</a></sup>')
    // After closing double/single quote directly: "N or 'N
    .replace(/(["’”])(\d{1,3})(?=[^\d]|$)/g, '$1<sup><a href="#note-$2">$2</a></sup>');
}

function processInline(t) {
  return markEndnoteRefs(markItalics(t));
}

function esc(t) {
  // t is already decoded from HTML entities; just sanitise any stray </>
  // that are NOT our own injected tags
  return t
    .replace(/&/g, '&amp;')
    .replace(/<(?!\/?(?:em|sup|a)\b)/g, '&lt;')
    .replace(/(?<!(?:em|sup|a|"[^"]*"))>/g, (m, offset, str) => {
      // Keep closing > of our known tags; escape others.
      // Simple approach: we'll do escaping before adding our tags.
      return m;
    });
}

// Safer: escape HTML first, then apply inline markup
function renderText(t) {
  // Escape & < > that aren't part of our markup
  const escaped = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return processInline(escaped);
}

// --- Line classifiers ---

function isVerseBlock(line) {
  return /^\s*\[\d+(?::\d+)?\]\s/.test(line);
}

function isTierHeading(line) {
  return /^Tier \d+:/.test(line.trim());
}

function isBookHeading(line) {
  return /^[A-F]\. /.test(line.trim());
}

function isPericopeTitle(line) {
  const t = line.trim();
  // Pericope titles always start with a capitalised book name, section ref, or digit
  // (e.g. "Mark 1:1–8 — ...", "Q 1 — ...", "1 Corinthians 9:1 — ...", "Logion 2 — ...").
  // They are short and contain em-dash. Liturgical poetry and prose intros are excluded
  // because they either start lowercase or are longer than 130 characters.
  return t.includes('—')
    && t.length < 130
    && /^[A-Z0-9"(P]/.test(t)
    && !isTierHeading(t)
    && !isBookHeading(t)
    && !isVerseBlock(t);
}

// Endnote lines: "42. Some content" or "42. *term*. Ref." etc.
function isEndnoteLine(line) {
  return /^\d{1,3}\. /.test(line.trim()) && endnotesStarted;
}

// --- Parse into structured segments ---

let endnotesStarted = false;
const segments = []; // { type, content }

// Title block: lines 0–6 (before "Preface")
let titleBlock = [];
let prefaceBlock = [];
let inPreface = false;
let afterPreface = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (!trimmed) continue;

  // Detect start of endnotes: first line matching "^1. "
  if (!endnotesStarted && /^1\. /.test(trimmed)) {
    endnotesStarted = true;
  }

  if (endnotesStarted) {
    segments.push({ type: 'endnote-line', content: trimmed });
    continue;
  }

  // Title block (first few lines before "Preface")
  if (!afterPreface && trimmed === 'Preface') {
    afterPreface = true;
    inPreface = true;
    segments.push({ type: 'preface-heading', content: 'Preface' });
    continue;
  }

  if (!afterPreface) {
    titleBlock.push(trimmed);
    continue;
  }

  if (inPreface && !isTierHeading(trimmed)) {
    segments.push({ type: 'preface-body', content: trimmed });
    if (isTierHeading(trimmed)) inPreface = false;
    continue;
  }

  if (isTierHeading(trimmed)) {
    inPreface = false;
    segments.push({ type: 'tier-heading', content: trimmed });
    continue;
  }

  if (isBookHeading(trimmed)) {
    segments.push({ type: 'book-heading', content: trimmed });
    continue;
  }

  if (isVerseBlock(trimmed)) {
    segments.push({ type: 'verse-block', content: trimmed });
    continue;
  }

  if (isPericopeTitle(trimmed)) {
    segments.push({ type: 'pericope-title', content: trimmed });
    continue;
  }

  // Everything else: prose (intro paragraphs, liturgical poetry lines, etc.)
  segments.push({ type: 'prose', content: trimmed });
}

// --- Split verse blocks into individual verses ---

// A verse block is one long line with multiple [N] markers concatenated.
// We split on verse-number markers, keeping the number with its text.
function splitVerses(blockText) {
  // Match [N] or [N:M] at start of each verse
  const parts = blockText.split(/(?=\[\d+(?::\d+)?\]\s{1,3})/);
  return parts.map(p => p.trim()).filter(Boolean);
}

// --- Build HTML body ---

let bodyHtml = '';

function openTag(tag, attrs) {
  if (attrs) return `<${tag} ${attrs}>`;
  return `<${tag}>`;
}

// Title page
bodyHtml += '<div class="title-page">\n';
bodyHtml += `<h1 class="doc-title">${renderText(titleBlock[0] || 'THE BASILEIAN CANON')}</h1>\n`;
for (let i = 1; i < titleBlock.length; i++) {
  bodyHtml += `<p class="title-meta">${renderText(titleBlock[i])}</p>\n`;
}
bodyHtml += '</div>\n';

// Endnote accumulator
let endnoteLines = [];

// Group consecutive endnote-lines by number
for (const seg of segments) {
  if (seg.type === 'endnote-line') {
    endnoteLines.push(seg.content);
  }
}

// Build endnote HTML: each numbered entry followed by its continuation lines
function buildEndnotes(lines) {
  let html = '<section id="endnotes">\n<h1>Notes</h1>\n<ol>\n';
  let currentNum = null;
  let currentText = '';

  function flushNote() {
    if (currentNum !== null) {
      html += `<li id="note-${currentNum}">${renderText(currentText)}</li>\n`;
    }
  }

  for (const line of lines) {
    const m = line.match(/^(\d{1,3})\. ([\s\S]*)$/);
    if (m) {
      flushNote();
      currentNum = parseInt(m[1], 10);
      currentText = m[2];
    } else if (currentNum !== null) {
      currentText += ' ' + line;
    }
  }
  flushNote();
  html += '</ol>\n</section>\n';
  return html;
}

// Process main segments
for (const seg of segments) {
  if (seg.type === 'endnote-line') continue; // handled separately

  switch (seg.type) {
    case 'preface-heading':
      bodyHtml += '<section class="preface">\n<h2>Preface</h2>\n';
      break;

    case 'preface-body':
      if (isTierHeading(seg.content)) {
        bodyHtml += '</section>\n';
      } else {
        bodyHtml += `<p>${renderText(seg.content)}</p>\n`;
      }
      break;

    case 'tier-heading':
      bodyHtml += `<h1 class="tier-heading">${renderText(seg.content)}</h1>\n`;
      break;

    case 'book-heading':
      bodyHtml += `<h2 class="book-heading">${renderText(seg.content)}</h2>\n`;
      break;

    case 'pericope-title':
      bodyHtml += `<h3 class="pericope-title">${renderText(seg.content)}</h3>\n`;
      break;

    case 'prose':
      bodyHtml += `<p class="intro">${renderText(seg.content)}</p>\n`;
      break;

    case 'verse-block': {
      const verses = splitVerses(seg.content);
      for (const v of verses) {
        // Extract verse number
        const vm = v.match(/^(\[\d+(?::\d+)?\])\s*([\s\S]*)$/);
        if (vm) {
          const vnum = renderText(vm[1]);
          const vtext = renderText(vm[2]);
          bodyHtml += `<p class="verse"><span class="vnum">${vnum}</span> ${vtext}</p>\n`;
        } else {
          bodyHtml += `<p class="verse">${renderText(v)}</p>\n`;
        }
      }
      break;
    }
  }
}

// Close any unclosed preface section if tier came immediately after
// (handled by the tier-heading processing above, but add safety close)

bodyHtml += buildEndnotes(endnoteLines);

// --- CSS ---

const css = `
/* ── Page setup ── */
@page {
  size: 4.25in 5.5in;
  margin: 0.32in 0.28in;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 9pt;
  line-height: 1.45;
  color: #111;
  orphans: 2;
  widows: 2;
}

/* ── Headings ── */
h1.tier-heading {
  font-size: 10.5pt;
  font-weight: bold;
  text-align: center;
  margin: 0.2in 0 0.12in;
  page-break-before: always;
  break-before: page;
}
h1.tier-heading + * {
  page-break-before: avoid;
  break-before: avoid;
}

h2.book-heading {
  font-size: 10pt;
  font-weight: bold;
  margin: 0.18in 0 0.06in;
  page-break-after: avoid;
  break-after: avoid;
  border-bottom: 0.5pt solid #555;
  padding-bottom: 0.03in;
}

h3.pericope-title {
  font-size: 8.5pt;
  font-style: italic;
  font-weight: normal;
  margin: 0.14in 0 0.04in;
  page-break-after: avoid;
  break-after: avoid;
  color: #333;
}

/* ── Title page ── */
.title-page {
  page-break-after: always;
  break-after: page;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 4.5in;
  text-align: center;
  padding: 0.3in 0;
}
h1.doc-title {
  font-size: 13pt;
  font-weight: bold;
  margin-bottom: 0.15in;
  line-height: 1.3;
}
p.title-meta {
  font-size: 7.5pt;
  color: #444;
  margin-top: 0.07in;
  font-style: italic;
}

/* ── Preface ── */
.preface h2 {
  font-size: 10.5pt;
  font-weight: bold;
  text-align: center;
  margin: 0.2in 0 0.1in;
}
.preface p.intro {
  margin-bottom: 0.1in;
  text-indent: 0.2in;
}
.preface p.intro:first-of-type {
  text-indent: 0;
}

/* ── Verse text ── */
p.verse {
  margin: 0.04in 0;
  text-indent: 0;
  line-height: 1.42;
}
span.vnum {
  font-size: 6.5pt;
  font-weight: bold;
  color: #666;
  vertical-align: super;
  line-height: 0;
  margin-right: 0.02in;
}

/* ── Intro / prose paragraphs ── */
p.intro {
  font-size: 8pt;
  font-style: italic;
  color: #333;
  margin: 0.04in 0 0.08in;
  line-height: 1.38;
}

/* ── Endnotes ── */
#endnotes h1 {
  font-size: 10.5pt;
  font-weight: bold;
  text-align: center;
  margin: 0.2in 0 0.12in;
  page-break-before: always;
  break-before: page;
}
#endnotes ol {
  padding-left: 0.25in;
  font-size: 7pt;
  line-height: 1.35;
  list-style-type: decimal;
}
#endnotes li {
  margin-bottom: 0.06in;
}
#endnotes li em {
  font-style: italic;
}

/* ── Links (endnote refs) ── */
sup a {
  font-size: 6pt;
  text-decoration: none;
  color: #555;
}
sup a:hover { text-decoration: underline; }

/* ── Print instructions (screen only) ── */
.print-instructions {
  background: #eef6ff;
  border: 1pt solid #99aacc;
  border-radius: 4pt;
  padding: 0.15in 0.18in;
  margin-bottom: 0.2in;
  font-size: 8pt;
  font-family: -apple-system, Arial, sans-serif;
  line-height: 1.5;
}
.print-instructions h2 {
  font-size: 9pt;
  font-weight: bold;
  margin-bottom: 0.08in;
  border: none;
  padding: 0;
  font-style: normal;
  text-align: left;
}
.print-instructions ol {
  padding-left: 1.2em;
  margin-top: 0.05in;
}
.print-instructions li { margin-bottom: 0.04in; }
.print-instructions strong { font-weight: bold; }
@media print {
  .print-instructions { display: none; }
}
`.trim();

// --- Print instructions banner ---

const printInstructions = `
<div class="print-instructions">
  <h2>How to print this booklet</h2>
  <ol>
    <li>Open this file in <strong>Chrome</strong> or <strong>Firefox</strong>.</li>
    <li>Press <strong>Ctrl+P</strong> (Windows/Linux) or <strong>⌘+P</strong> (Mac) to open Print.</li>
    <li>Set <strong>Paper size: Letter (8.5&times;11&quot;)</strong> and <strong>Orientation: Portrait</strong>.</li>
    <li><em>Recommended:</em> Click <strong>Save as PDF</strong>, then open the PDF in <strong>Adobe Acrobat/Reader</strong> and choose
      Print &rarr; Page Sizing &amp; Handling &rarr; <strong>Multiple</strong> &rarr; Pages per sheet: <strong>4</strong>
      &rarr; Print on both sides (flip on <strong>long edge</strong>).</li>
    <li><em>Firefox direct:</em> File &rarr; Print &rarr; More Settings &rarr; Pages per Sheet: <strong>4</strong>
      &rarr; Two-sided &rarr; Print.</li>
  </ol>
  <p style="margin-top:0.07in;">Each physical sheet will contain <strong>8 booklet pages</strong> (4 per side, 2&times;2 grid).
  Stack printed sheets and bind with staples, comb, or saddle-stitch.</p>
</div>
`.trim();

// --- Final HTML document ---

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Basileian Canon — Booklet</title>
<style>
${css}
</style>
</head>
<body>
${printInstructions}
${bodyHtml}
</body>
</html>`;

fs.writeFileSync(DEST, html, 'utf8');
console.log(`Written: ${DEST} (${Math.round(fs.statSync(DEST).size / 1024)} KB)`);
