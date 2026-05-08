# Basileian Canon — Source Texts (v3)

This directory contains the original-language source texts of the Basileian Canon (also known as the Jesus Tradition canon), structured as JSON files for ingestion by reading and study applications.

## Contents

- **index.json** — master directory of all section files plus metadata, schema documentation, and recommendations for parallel public-domain resources.
- **18 section files** — one per canon section, named by tier and letter (e.g., `tier1_a_mark.json`, `tier2_f_didache.json`, `tier3_d_poxy_5575.json`).

## Schema overview

Each section file contains a single section's metadata and pericopes. Pericope structure varies slightly by section type but always includes a stable `pericope_id`, a human-readable `reference`, and an array of `verses` (or in Q's case, `lk_versions` and `mt_versions` parallel arrays).

Each verse carries:

- `verse_id` — stable identifier in `{book}.{chapter_or_logion}.{verse}` format (e.g., `mark.1.3`, `thomas.113.1`)
- `reference` — human-readable citation (e.g., "Mark 1:3")
- `text` — the source-language text in canon-style unaccented Greek or Sahidic Coptic
- `transliteration` — Latin-character form for non-Greek/Coptic readers

The `verse_id` is the load-bearing element of the schema. It is stable across all canonical references and matches the format used by virtually every public-domain biblical resource. This means highlights, notes, parallel translations, lexicon entries, and commentaries can all be joined to the source text by `verse_id` alone, without modifying these files.

## Source provenance

Greek New Testament material draws on two public-domain or freely-distributable sources:

- **Westcott-Hort 1881** (*The New Testament in the Original Greek*) — fully public domain. Used for Mark, Q (via Lukan and Matthean parallels), Special L, Special M, the Didache (via Lake's Loeb edition).
- **SBLGNT** (Holmes ed., 2010) — freely distributable for non-commercial use, license terms at sblgnt.com/license. Used for John, Tier 2 New Testament material (1 Cor, Galatians, Acts, Lk 24:50–53). The text-critical differences from WH 1881 are minor and orthographic for the verses in this canon; a future revision should reconcile these to WH directly.

Sahidic Coptic Thomas material follows the **Nag Hammadi Codex II,2** (Layton 1989 standard transcription).

The Tier 3 apocryphal sections are placeholders pending source-fetch from public-domain primary editions:

- P.Egerton 2 — Bell & Skeat 1935
- P.Oxy 1224 — Grenfell & Hunt 1914
- P.Oxy 840 — Grenfell & Hunt 1908
- Gospel of Peter — Bouriant 1892
- Jewish-Christian gospel citations — Origen, Jerome, Epiphanius primary sources (Migne PG/PL)

P.Oxy 5575 is copyrighted (Egypt Exploration Society 2023) and cannot be reproduced; the file contains a citation pointing to the publication.

## Convention notes

**Canon-style Greek** means unaccented Greek in the manuscript-tradition style. Specifically: no accents, no breathings, no iota subscripts, final sigma rendered as σ (medial form), and medial mu rendered as µ (the form used by the source PDF). This convention reflects the actual practice of Greek uncial manuscripts through approximately the 9th century. Modern Greek bibles (NA28, SBLGNT) use editorial accentuation; the Basileian canon does not.

**Sahidic Coptic** preserves the supralinear strokes (combining macron) and nomina sacra (sacred-name abbreviations) that characterize the manuscript tradition. ⲓ︤ⲥ︥ for Iēsous, ⲡ̄ⲛ︤ⲁ︥ for pneuma, etc. Latin-character transliterations strip these markings.

## Completeness

| Section | Pericopes | Verses with text | Status |
|---------|-----------|------------------|--------|
| 1A Mark | 67 | 661 | Complete |
| 1B Q | 38 | 529 | Complete |
| 1C Special L | 12 | 112 | Complete |
| 1D Special M | 4 | 48 | Complete |
| 1E Thomas | 57 | 16 (of 57) | Partial — 41 logia pending |
| 1F John | 12 | 291 (of 12 pericopes) | 11 of 12 pericopes complete |
| 2A Last Supper | 1 | 4 | Complete |
| 2B Appearances | 1 | 5 | Complete |
| 2C Pauline claims | 6 | 53 | Complete |
| 2D Ascension | 2 | 15 | Complete |
| 2E Agraphon | 1 | 1 | Complete |
| 2F Didache | 3 | 13 | Complete |
| 3A Egerton | 3 | 0 | Placeholder |
| 3B P.Oxy 1224 | 4 | 0 | Placeholder |
| 3C P.Oxy 840 | 1 | 0 | Placeholder |
| 3D P.Oxy 5575 | 3 | 0 | External (copyrighted) |
| 3E Gospel of Peter | 4 | 0 | Placeholder |
| 3F Jewish-Christian | 3 | 0 | Placeholder |

About 1750 verses of source-language text are populated across the corpus. About 60 pericopes remain as placeholders pending source-fetch in subsequent revisions.

## App integration

For each of the six features the app needs to support:

**Navigation** — the index file lists all sections; each section file lists its pericopes; each pericope lists its verses. Three levels of navigation are sufficient.

**Highlighting and notes** — store user data keyed to `verse_id`. The same verse identifier persists across all canonical references and corpus revisions.

**Parallel translation comparison** — load a public-domain translation (KJV, ASV, YLT, Darby, World English Bible) keyed to the same `verse_id` format. All five are listed in `index.json` under `external_resources_recommendations`.

**Word-lookup in scripture dictionary** — for the v3 corpus, this requires the app to tokenize each verse client-side (split on whitespace) and look up each word in a public-domain Greek lexicon by the surface form. A future revision will add per-token lemma and Strong's data, at which point the app can join precisely.

**Commentary view** — load a public-domain commentary (Jamieson-Fausset-Brown, Matthew Henry, Barnes, Clarke, Gill) keyed to canonical reference. The commentary's reference format will need to be normalized to `verse_id` format during ingestion.

**Future revisions** — additional layers (token data, complete apocrypha, complete Thomas, Pericope Adulterae, WH reconciliation) can be added without changing the existing schema. See `index.json` `future_revisions` field.

## License

The original-language texts in this corpus are in the public domain. The metadata, structure, and convention documentation are released under CC0. Where SBLGNT-derived text is used (John, Tier 2 NT material, Pericope Adulterae fetch), the SBLGNT license terms apply; see http://sblgnt.com/license/.
