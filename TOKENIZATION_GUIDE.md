# Tokenization Guide: Adding Word-Level Strong's to Basileian Reader

## Overview

This guide walks through tokenizing your corpus with OpenGNT Strong's numbers to enable word-level concordance lookups.

**What this achieves:**
- Each Greek word in the corpus is tokenized and linked to its Strong's number
- Users can click any word to see its Strong's definition
- Full word-level linguistic analysis becomes possible

---

## Architecture

### Data Flow

```
OpenGNT.csv (eliranwong/OpenGNT)
    ↓
tokenize-with-strongs.js (normalizes & maps)
    ↓
tier*.json (augmented with `words` array)
    ↓
app.js (renderOriginalPassageWithTokens)
    ↓
Browser (HTML with data-strongs attributes)
    ↓
User clicks word → openStrongsModal()
```

### File Structure After Tokenization

```
basileian-reader/
├── tier1_a_mark.json          # Updated with .words arrays
├── tier1_b_q.json
├── ... (all 18 tier files)
├── scripts/
│   ├── tokenize-with-strongs.js     # Main tokenization script
│   ├── app-word-rendering-functions.js  # Rendering functions
│   └── cache/
│       └── OpenGNT.csv              # Downloaded mapping data
└── lexicons/
    ├── word-strongs-map.json        # form → Strong's (output)
    └── lemma-strongs-map.json       # lemma → Strong's (output)
```

---

## Step-by-Step Setup

### 1. Download OpenGNT Data

```bash
# Option A: Clone the full repo (large download, ~1GB)
git clone https://github.com/eliranwong/OpenGNT.git

# Option B: Download just the CSV (recommended)
mkdir -p scripts/cache
curl -L "https://github.com/eliranwong/OpenGNT/raw/master/OpenGNT.csv.zip" \
  -o scripts/cache/OpenGNT.csv.zip
unzip scripts/cache/OpenGNT.csv.zip -d scripts/cache/
```

**File size:** ~20MB (compressed), ~300MB (uncompressed)

**Expected location:** `scripts/cache/OpenGNT.csv`

### 2. Run Tokenization Script

```bash
node scripts/tokenize-with-strongs.js
```

**Output:**
```
🔧 Basileian Corpus Tokenizer with Strong's Numbers

📖 Loading OpenGNT mappings...
✓ Loaded 5,427 word→Strong's mappings
✓ Loaded 2,156 lemma→Strong's mappings

🔤 Tokenizing corpus...

📄 Processing tier1_a_mark.json...
✓ Updated tier1_a_mark.json

📄 Processing tier1_b_q.json...
✓ Updated tier1_b_q.json

... (all 18 files)

📊 Summary:
  Total verses processed: 1,847
  Verses with Strong's mappings: 1,621

✓ Saved 5,427 word mappings to lexicons/word-strongs-map.json
✓ Saved 2,156 lemma mappings to lexicons/lemma-strongs-map.json

✅ Tokenization complete!
```

### 3. Verify Output

Check a sample file:

```bash
jq '.pericopes[0].verses[0].words' tier1_a_mark.json
```

**Expected output:**
```json
[
  {
    "text": "αρχη",
    "normalized": "αρχη",
    "strongs": "G746"
  },
  {
    "text": "του",
    "normalized": "του",
    "strongs": "G3588"
  },
  ...
]
```

### 4. Update app.js

Replace the `renderPassage()` function in app.js:

```javascript
function renderPassage(section) {
  if (state.activeTranslation !== "basileia" && canTranslateSection(section)) {
    return renderTranslatedPassage(section);
  }
  // Use new word-level renderer:
  return renderOriginalPassageWithTokens(section, state.activeTranslation !== "basileia");
}
```

### 5. Add Rendering Functions

Copy these functions from `scripts/app-word-rendering-functions.js` into app.js:

- `formatParagraphWithTokens()`
- `formatParagraphWithTokenizedWords()`
- `renderOriginalPassageWithTokens()`
- `renderPassageWithInlineTokens()` (optional, experimental)

### 6. Add Styling

Append to `style-additions.css`:

```css
/* Word-level rendering */
.verse-with-tokens {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.verse-number {
  font-weight: 600;
  color: var(--text-muted);
  min-width: 3rem;
}

.verse-tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.source-word {
  display: inline-block;
  padding: 0.1rem 0.3rem;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.source-word[data-strongs] {
  text-decoration: underline dotted;
  text-decoration-color: #0288d1;
  text-underline-offset: 2px;
}

.source-word[data-strongs]:hover {
  background-color: rgba(2, 136, 209, 0.1);
  border-radius: 2px;
}

[data-theme="dark"] .source-word[data-strongs] {
  text-decoration-color: #4fc3f7;
}

[data-theme="dark"] .source-word[data-strongs]:hover {
  background-color: rgba(79, 195, 247, 0.1);
}
```

### 7. Deploy

```bash
git add tier*.json lexicons/ scripts/
git commit -m "Add word-level Strong's concordance tokenization"
git push origin main
```

---

## Data Structures

### Verse Object (Before)

```json
{
  "verse_id": "mark.1.1",
  "reference": "Mark 1:1",
  "text": "αρχη του ευαγγελιου ιησου χριστου",
  "transliteration": "archē toy eyangelioy iēsoy christoy"
}
```

### Verse Object (After)

```json
{
  "verse_id": "mark.1.1",
  "reference": "Mark 1:1",
  "text": "αρχη του ευαγγελιου ιησου χριστου",
  "transliteration": "archē toy eyangelioy iēsoy christoy",
  "words": [
    {
      "text": "αρχη",
      "normalized": "αρχη",
      "strongs": "G746"
    },
    {
      "text": "του",
      "normalized": "του",
      "strongs": "G3588"
    },
    {
      "text": "ευαγγελιου",
      "normalized": "ευαγγελιου",
      "strongs": "G2098"
    },
    {
      "text": "ιησου",
      "normalized": "ιησου",
      "strongs": "G2424"
    },
    {
      "text": "χριστου",
      "normalized": "χριστου",
      "strongs": "G5547"
    }
  ]
}
```

### Lexicon Files

**lexicons/word-strongs-map.json:**
```json
{
  "αρχη": "G746",
  "του": "G3588",
  "ευαγγελιου": "G2098",
  "ιησου": "G2424",
  "χριστου": "G5547",
  ...
}
```

**lexicons/lemma-strongs-map.json:**
```json
{
  "αρχη": "G746",
  "αρτος": "G740",
  "αγαπαω": "G25",
  ...
}
```

---

## HTML Output

### Rendered Verse

```html
<p id="v-mark_1_1" class="verse-with-tokens" data-verse-id="mark.1.1">
  <span class="verse-number">Mark 1:1</span>
  <span class="verse-tokens">
    <span class="source-word" data-strongs="G746">αρχη</span>
    <span class="source-word" data-strongs="G3588">του</span>
    <span class="source-word" data-strongs="G2098">ευαγγελιου</span>
    <span class="source-word" data-strongs="G2424">ιησου</span>
    <span class="source-word" data-strongs="G5547">χριστου</span>
  </span>
</p>
```

### User Interaction

1. User clicks word: `<span class="source-word" data-strongs="G2098">`
2. Event listener fires (already in `attachDynamicReaderEvents()`)
3. `openStrongsModal("G2098")` is called
4. Strong's definition modal appears

---

## Troubleshooting

### Script runs but no mappings loaded

**Problem:** `⚠ No mappings loaded`

**Solution:**
- Verify OpenGNT.csv exists at `scripts/cache/OpenGNT.csv`
- Check file is unzipped and readable
- Try downloading again from GitHub

### Fewer mappings than expected

**Problem:** Only X% of verses have Strong's numbers

**Likely causes:**
1. **Text normalization mismatch:** Your text has accents, OpenGNT is unaccented
   - Solution: Verify normalization function in script
2. **Coptic material:** Thomas Gospel has no Strong's mappings
   - Expected: Coptic verses won't have Strong's numbers
3. **Variant spellings:** Some words may not match exactly
   - Fallback: Use lemma mapping instead

### Words not rendering with data-strongs

**Problem:** Words display but aren't clickable

**Check:**
1. `verse.words` array exists in JSON ✓
2. Functions copied to app.js ✓
3. `renderOriginalPassageWithTokens()` is being called ✓
4. Browser console for errors

**Debug in console:**
```javascript
// Check if tokenization worked
console.log(document.querySelectorAll('[data-strongs]').length);

// Check first word
const words = document.querySelectorAll('.source-word[data-strongs]');
console.log(words[0].getAttribute('data-strongs'));

// Manual test
openStrongsModal('G746');  // Should open λόγος definition
```

---

## Performance Notes

- **Tokenization time:** ~2–5 seconds for full corpus
- **File size increase:** ~10–15% (words array overhead)
- **Runtime impact:** Negligible (words array is already in JSON)
- **Browser memory:** <5MB additional (lexicon caches)

---

## Future Enhancements

### Phase 2: Morphological Analysis

Add morphological parsing codes:
```json
{
  "text": "ἐβαπτίσθη",
  "normalized": "εβαπτισθη",
  "strongs": "G907",
  "rmac": "VIAP3SG",    // Robinson's Morphological Analysis Codes
  "lemma": "βαπτίζω"
}
```

**Source:** MorphGNT already has this; add to tokenization script.

### Phase 3: Interlinear View

Side-by-side Greek | English gloss | Strong's definition

### Phase 4: Lemmatized Search

"Find all occurrences of λόγος regardless of case"

---

## References

- **OpenGNT:** https://github.com/eliranwong/OpenGNT
- **MorphGNT:** https://github.com/morphgnt/morphgnt
- **Strong's Concordance:** https://www.blueletterbible.org/
- **Basileian Canon:** https://github.com/mikesturm/basileian-reader

---

## License

This tokenization process preserves all original licenses:
- Basileian corpus: CC0 / public domain
- OpenGNT data: CC-BY-SA 4.0
- Strong's numbers: Public domain
