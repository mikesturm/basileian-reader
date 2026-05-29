# Basileian Canon — Source Texts (v3)

This directory contains the original-language source texts of the Basileian Canon (also known as the Jesus Tradition canon), structured as JSON files for ingestion by reading and study applications.

## Contents

- **index.json** — master directory of all section files plus metadata, schema documentation, and recommendations for parallel public-domain resources.
- **19 section files** — one per canon section, named by tier and letter (e.g., `tier1_a_mark.json`, `tier2_g_didache.json`, `tier3_d_poxy_5575.json`).
- **lexicons/wh-tokens.json** — parallel token layer (produced by `ingest-wh.js`): per-token Strong's G-number and morphological tag for every WH/RP2005-sourced verse, keyed by `verse_id`.

## Schema overview

Each section file contains a single section's metadata and pericopes. Pericope structure varies slightly by section type but always includes a stable `pericope_id`, a human-readable `reference`, and an array of `verses` (or in Q's case, `lk_versions` and `mt_versions` parallel arrays).

Each verse carries:

- `verse_id` — stable identifier in `{book}.{chapter_or_logion}.{verse}` format (e.g., `mark.1.3`, `thomas.113.1`)
- `reference` — human-readable citation (e.g., "Mark 1:3")
- `text` — the source-language text in canon-style unaccented Greek or Sahidic Coptic
- `transliteration` — Latin-character form for non-Greek/Coptic readers

The `verse_id` is the load-bearing element of the schema. It is stable across all canonical references and corpus revisions. Highlights, notes, parallel translations, lexicon entries, commentaries, and the token layer in `lexicons/wh-tokens.json` all join to the source text by `verse_id` alone.

## Source provenance

All Greek New Testament material is sourced from **Westcott-Hort 1881** (*The New Testament in the Original Greek*, Westcott & Hort, 1881) via the byztxt/greektext-westcott-hort repository (Sandborg-Petersen ed.), which is fully public domain.

- **Westcott-Hort 1881** — used for Mark, Q (via Lukan and Matthean parallels), Special L, Special M, John, and all Tier 2 New Testament material (1 Cor, Galatians, Acts, Luke 24:50–53, 1 Thess).
- **Robinson-Pierpont Byzantine Majority Text 2018** (byztxt/byzantine-majority-text, public domain) — used exclusively for John 7:53–8:11 (Pericope Adulterae), which is absent from WH 1881. This pericope is marked `wh_status: "absent_in_wh"` in the section file.
- **SBLGNT terms no longer apply to almost all of this corpus** — the NT layer is now uniformly sourced from public-domain editions, with one exception: `tier2_f_agraphon.json` (Acts 20:35, 1 verse) remains SBLGNT-derived per scope decision; the SBLGNT license (sblgnt.com/license) applies to that file.

Sahidic Coptic Thomas material follows the **Nag Hammadi Codex II,2** (Layton 1989 standard transcription).

The Tier 3 apocryphal sections are placeholders pending source-fetch from public-domain primary editions:

- P.Egerton 2 — Bell & Skeat 1935
- P.Oxy 1224 — Grenfell & Hunt 1914
- P.Oxy 840 — Grenfell & Hunt 1908
- Gospel of Peter — Bouriant 1892
- Jewish-Christian gospel citations — Origen, Jerome, Epiphanius primary sources (Migne PG/PL)

P.Oxy 5575 is copyrighted (Egypt Exploration Society 2023) and cannot be reproduced; the file contains a citation pointing to the publication.

## Convention notes

**Canon-style Greek** means unaccented Greek in the manuscript-tradition style. Specifically: no accents, no breathings, no iota subscripts, final sigma rendered as σ (medial form), and medial mu rendered as µ (U+00B5 MICRO SIGN, consistent with the WH source PDF convention). This convention reflects the actual practice of Greek uncial manuscripts through approximately the 9th century. Modern Greek bibles (NA28, SBLGNT) use editorial accentuation; the Basileian canon does not.

**Sahidic Coptic** preserves the supralinear strokes (combining macron) and nomina sacra (sacred-name abbreviations) that characterize the manuscript tradition. ⲓ︤ⲥ︥ for Iēsous, ⲡ̄ⲛ︤ⲁ︥ for pneuma, etc. Latin-character transliterations strip these markings.

## Completeness

| Section | Pericopes | Verses with text | Token layer | Status |
|---------|-----------|------------------|-------------|--------|
| 1A Mark | 67 | 661 | — | Complete |
| 1B Q | 38 | 529 | — | Complete |
| 1C Special L | 12 | 112 | — | Complete |
| 1D Special M | 4 | 48 | — | Complete |
| 1E Thomas | 57 | 16 (of 57) | — | Partial — 41 logia pending |
| 1F John | 12 | 303 (291 WH + 12 PA) | ✓ WH + RP2005 | Complete |
| 2A Last Supper | 1 | 4 | ✓ WH | Complete |
| 2B Appearances | 1 | 5 | ✓ WH | Complete |
| 2C Dominical sayings | 3 | 6 | ✓ WH | Complete |
| 2D Pauline claims | 6 | 53 | ✓ WH | Complete |
| 2E Ascension | 2 | 15 | ✓ WH | Complete |
| 2F Agraphon | 1 | 1 | — | Complete |
| 2G Didache | 3 | 13 | — | Complete |
| 3A Egerton | 3 | 0 | — | Placeholder |
| 3B P.Oxy 1224 | 4 | 0 | — | Placeholder |
| 3C P.Oxy 840 | 1 | 0 | — | Placeholder |
| 3D P.Oxy 5575 | 3 | 0 | — | External (copyrighted) |
| 3E Gospel of Peter | 4 | 0 | — | Placeholder |
| 3F Jewish-Christian | 3 | 0 | — | Placeholder |

The token layer (`lexicons/wh-tokens.json`) covers 386 verse entries across John, 1 Corinthians, Galatians, Acts, Luke, and 1 Thessalonians. Each token carries: `token` (normalised Greek word), `strongs` (G-number), `morph` (Robinson morphological tag). About 1762 verses of source-language text are populated across the corpus.

## App integration

For each of the six features the app needs to support:

**Navigation** — the index file lists all sections; each section file lists its pericopes; each pericope lists its verses. Three levels of navigation are sufficient.

**Highlighting and notes** — store user data keyed to `verse_id`. The same verse identifier persists across all canonical references and corpus revisions.

**Parallel translation comparison** — load a public-domain translation (KJV, ASV, YLT, Darby, World English Bible) keyed to the same `verse_id` format. All five are listed in `index.json` under `external_resources_recommendations`.

**Word-lookup in scripture dictionary** — use `lexicons/wh-tokens.json` for WH-sourced verses (precise per-token Strong's G-number); for other verses use `lexicons/verse-words.json` (lemma-matched). Both files are keyed by `verse_id`.

**Commentary view** — load a public-domain commentary (Jamieson-Fausset-Brown, Matthew Henry, Barnes, Clarke, Gill) keyed to canonical reference. The commentary's reference format will need to be normalized to `verse_id` format during ingestion.

**Future revisions** — additional layers (complete apocrypha, complete Thomas, Pericope Adulterae critical notes) can be added without changing the existing schema. See `index.json` `future_revisions` field.

## Data pipeline

```
WH 1881 source  ──→  ingest-wh.js  ──→  section files (text)
(byztxt/greektext-westcott-hort)         lexicons/wh-tokens.json

RP2005 (PA only)──→  ingest-wh.js  ──→  tier1_f_john.json (PA verses)
(byztxt/byzantine-majority-text)

strongs npm pkg  ──→  build-lexicons.js  ──→  lexicons/strongs-index.json
wh-tokens.json  ──┘                          lexicons/word-strongs-map.json
                                             lexicons/verse-words.json
```

Run order: `npm run ingest-wh && npm run build-lexicons`

## License

The original-language texts in this corpus are in the public domain:

- WH 1881 text is fully public domain (published 1881).
- Robinson-Pierpont 2018 is released under the Unlicense (public domain).
- The metadata, structure, and convention documentation are released under CC0.

The `strongs` npm package used by the lexicon builder is derived from James Strong's 1890 concordance (public domain).
