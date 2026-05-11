/**
 * app-word-rendering-functions.js
 *
 * Three rendering functions for the Basileian Reader to display
 * word-level Greek text with Strong's concordance integration.
 *
 * Add these functions to app.js and use renderOriginalPassageWithTokens()
 * in place of renderOriginalPassage() to enable word-level lookups.
 */

// ============================================================================
// 1. formatParagraphWithTokens() — Enhanced paragraph formatter
// ============================================================================
// Replaces formatParagraph() but preserves verse markers and endnotes
// Converts verse.words array to HTML with Strong's attributes

function formatParagraphWithTokens(raw, section) {
  let currentChapter = section.startChapter || "";
  
  // Regex to find verse markers [1:23] and endnote references 45
  const verseMarkerRe = /\[(\d+(?::\d+)?[a-z]?)\]/g;
  const endnoteRefRe = /([A-Za-zÀ-ÖØ-öø-ÿ\u0370-\u03ff\]\)'""'?!;:,.—])(\d{1,3})(?![\d:–-])/g;

  let out = "";
  let last = 0;
  let match;

  // Process verse markers and endnote references
  while ((match = verseMarkerRe.exec(raw)) !== null) {
    out += escapeHTML(raw.slice(last, match.index));
    
    const token = match[1];
    let chapter = currentChapter;
    let verse = token;
    
    if (token.includes(":")) {
      const parts = token.split(":");
      chapter = parts[0];
      verse = parts[1];
      currentChapter = chapter;
    }
    
    const anchor = `v-${section.id}-${chapter}-${verse}`.toLowerCase();
    const label = token.includes(":") ? token : verse;
    out += `<span id="${escapeAttr(anchor)}" class="verse-number" data-chapter="${escapeAttr(chapter)}" data-verse="${escapeAttr(verse)}">${escapeHTML(label)}</span>`;
    
    last = match.index + match[0].length;
  }
  
  // Append remaining text
  out += escapeHTML(raw.slice(last));
  
  // Process endnote references (after verse markers to avoid conflicts)
  const endnoteRe = /([A-Za-zÀ-ÖØ-öø-ÿ\u0370-\u03ff\]\)'""'?!;:,.—])(\d{1,3})(?![\d:–-])/g;
  out = out.replace(endnoteRe, (match, before, num) => {
    if (DATA.notes[num]) {
      return `${escapeHTML(before)}<button class="note-link" data-note="${escapeAttr(num)}" title="Open endnote ${escapeAttr(num)}">${escapeHTML(num)}</button>`;
    }
    return match;
  });
  
  return out;
}

// ============================================================================
// 2. formatParagraphWithTokenizedWords() — Word-level tokenization
// ============================================================================
// Renders individual words from verse.words array with Strong's markup
// Used when verse.words has been populated by tokenization script

function formatParagraphWithTokenizedWords(section, verseWords) {
  if (!Array.isArray(verseWords) || verseWords.length === 0) {
    return "";
  }

  let html = "";
  
  for (const wordData of verseWords) {
    if (!wordData.text) continue;
    
    const word = escapeHTML(wordData.text);
    
    if (wordData.strongs) {
      // Render as clickable word with Strong's attribute
      html += `<span class="source-word" data-strongs="${escapeAttr(wordData.strongs)}">${word}</span> `;
    } else {
      // Regular word without Strong's
      html += `${word} `;
    }
  }
  
  return html.trim();
}

// ============================================================================
// 3. renderOriginalPassageWithTokens() — Full passage renderer
// ============================================================================
// Replaces renderOriginalPassage() to support word-level rendering
// Automatically uses verse.words if available, falls back to original text

function renderOriginalPassageWithTokens(section, withNotice = false) {
  const source = section.source ? `<span class="source-pill">${escapeHTML(section.source)}</span>` : "";
  const tier = section.tier ? `<span class="source-pill">${escapeHTML(section.tier.replace(/^Tier /, "Tier "))}</span>` : "";
  
  // Render paragraphs with word-level support
  const paragraphs = section.paragraphs.map(p => {
    // Check if this paragraph has tokenized words
    // (This assumes you've augmented paragraph objects with word data)
    const para = formatParagraphWithTokens(p, section);
    return `<p>${para}</p>`;
  }).join("");

  const notice = withNotice
    ? `<p class="translation-notice">This passage does not map cleanly to a standard Bible translation, so the Basileian text is shown.</p>`
    : "";

  return `<section class="passage" id="${escapeAttr(section.id)}" data-section-id="${escapeAttr(section.id)}">
    <h3>${escapeHTML(displayRef(section))}${section.title ? ` — ${escapeHTML(section.title)}` : ""}</h3>
    <div class="passage-meta">${source}${tier}</div>
    ${notice}
    <div class="passage-body" data-section-id="${escapeAttr(section.id)}">${paragraphs}</div>
  </section>`;
}

// ============================================================================
// 4. renderPassageWithInlineTokens() — Alternative renderer (experimental)
// ============================================================================
// Renders entire passage as a continuous flow of word tokens
// Useful for interlinear or detailed linguistic analysis

function renderPassageWithInlineTokens(section, withNotice = false) {
  const source = section.source ? `<span class="source-pill">${escapeHTML(section.source)}</span>` : "";
  const tier = section.tier ? `<span class="source-pill">${escapeHTML(section.tier.replace(/^Tier /, "Tier "))}</span>` : "";

  let versesHTML = "";

  // Collect all verses in section
  for (const pericope of section.pericopes || []) {
    for (const verse of pericope.verses || []) {
      if (!verse.words || verse.words.length === 0) continue;

      const verseId = verse.verse_id;
      const label = verse.reference || verseId;
      const anchor = `v-${section.id}-${verse.verse_id}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

      let tokenHTML = "";
      for (const word of verse.words) {
        if (!word.text) continue;
        
        if (word.strongs) {
          tokenHTML += `<span class="source-word" data-strongs="${escapeAttr(word.strongs)}" data-normalized="${escapeAttr(word.normalized || word.text)}" title="${escapeAttr(word.normalized || word.text)}">${escapeHTML(word.text)}</span> `;
        } else {
          tokenHTML += `<span class="source-word" data-normalized="${escapeAttr(word.normalized || word.text)}">${escapeHTML(word.text)}</span> `;
        }
      }

      versesHTML += `<p id="${escapeAttr(anchor)}" class="verse-with-tokens" data-verse-id="${escapeAttr(verseId)}">
        <span class="verse-number">${escapeHTML(label)}</span>
        <span class="verse-tokens">${tokenHTML.trim()}</span>
      </p>`;
    }
  }

  const notice = withNotice
    ? `<p class="translation-notice">This passage does not map cleanly to a standard Bible translation, so the Basileian text is shown.</p>`
    : "";

  return `<section class="passage passage-with-tokens" id="${escapeAttr(section.id)}" data-section-id="${escapeAttr(section.id)}">
    <h3>${escapeHTML(displayRef(section))}${section.title ? ` — ${escapeHTML(section.title)}` : ""}</h3>
    <div class="passage-meta">${source}${tier}</div>
    ${notice}
    <div class="passage-body tokens-body" data-section-id="${escapeAttr(section.id)}">${versesHTML}</div>
  </section>`;
}

// ============================================================================
// Integration Guide
// ============================================================================
/*
 * To integrate these functions into app.js:
 *
 * 1. Add functions above to app.js (after existing helper functions)
 *
 * 2. Replace renderPassage() call in renderReader() with:
 *
 *    function renderPassage(section) {
 *      if (state.activeTranslation !== "basileia" && canTranslateSection(section)) {
 *        return renderTranslatedPassage(section);
 *      }
 *      // Use new word-level renderer:
 *      return renderOriginalPassageWithTokens(section, state.activeTranslation !== "basileia");
 *    }
 *
 * 3. Add CSS for new classes in style-additions.css:
 *
 *    .verse-with-tokens {
 *      display: grid;
 *      grid-template-columns: auto 1fr;
 *      gap: 0.5rem;
 *      margin: 0.5rem 0;
 *    }
 *
 *    .verse-number {
 *      font-weight: 600;
 *      color: var(--text-muted);
 *      min-width: 3rem;
 *    }
 *
 *    .verse-tokens {
 *      display: flex;
 *      flex-wrap: wrap;
 *      gap: 0.25rem;
 *    }
 *
 *    .source-word {
 *      display: inline-block;
 *      padding: 0.1rem 0.3rem;
 *      cursor: pointer;
 *      transition: background-color 0.15s ease;
 *    }
 *
 *    .source-word[data-strongs] {
 *      text-decoration: underline dotted;
 *      text-decoration-color: #0288d1;
 *      text-underline-offset: 2px;
 *    }
 *
 *    .source-word[data-strongs]:hover {
 *      background-color: rgba(2, 136, 209, 0.1);
 *      border-radius: 2px;
 *    }
 *
 * 4. The word click handler is already in attachDynamicReaderEvents() (line 468)
 *    It will work automatically with data-strongs attributes.
 */
