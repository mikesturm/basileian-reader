#!/usr/bin/env python3
"""
convert-epub-net.py

Extracts all verses and footnotes from NETBIBLE21.epub and writes:
  translations/net.json          — flat {verse_id: text} with ⟦N·nXXXXXX⟧ note markers
  translations/net-notes/{book}.json — per-book {note_id: html_content} for lazy loading

Usage:
  python3 scripts/convert-epub-net.py
"""

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
EPUB_PATH = ROOT / 'NETBIBLE21.epub'
TRANSLATIONS_DIR = ROOT / 'translations'
OUTPUT_FILE = TRANSLATIONS_DIR / 'net.json'
NOTES_DIR = TRANSLATIONS_DIR / 'net-notes'
INDEX_FILE = ROOT / 'translations-index.json'

BOOK_NAME_MAP = {
    'Genesis': 'genesis',
    'Exodus': 'exodus',
    'Leviticus': 'leviticus',
    'Numbers': 'numbers',
    'Deuteronomy': 'deuteronomy',
    'Joshua': 'joshua',
    'Judges': 'judges',
    'Ruth': 'ruth',
    '1 Samuel': '1samuel',
    '2 Samuel': '2samuel',
    '1 Kings': '1kings',
    '2 Kings': '2kings',
    '1 Chronicles': '1chronicles',
    '2 Chronicles': '2chronicles',
    'Ezra': 'ezra',
    'Nehemiah': 'nehemiah',
    'Esther': 'esther',
    'Job': 'job',
    'Psalms': 'psalms',
    'Proverbs': 'proverbs',
    'Ecclesiastes': 'ecclesiastes',
    'Song of Solomon': 'songofsolomon',
    'Isaiah': 'isaiah',
    'Jeremiah': 'jeremiah',
    'Lamentations': 'lamentations',
    'Ezekiel': 'ezekiel',
    'Daniel': 'daniel',
    'Hosea': 'hosea',
    'Joel': 'joel',
    'Amos': 'amos',
    'Obadiah': 'obadiah',
    'Jonah': 'jonah',
    'Micah': 'micah',
    'Nahum': 'nahum',
    'Habakkuk': 'habakkuk',
    'Zephaniah': 'zephaniah',
    'Haggai': 'haggai',
    'Zechariah': 'zechariah',
    'Malachi': 'malachi',
    'Matthew': 'matthew',
    'Mark': 'mark',
    'Luke': 'luke',
    'John': 'john',
    'Acts': 'acts',
    'Romans': 'romans',
    '1 Corinthians': '1corinthians',
    '2 Corinthians': '2corinthians',
    'Galatians': 'galatians',
    'Ephesians': 'ephesians',
    'Philippians': 'philippians',
    'Colossians': 'colossians',
    '1 Thessalonians': '1thessalonians',
    '2 Thessalonians': '2thessalonians',
    '1 Timothy': '1timothy',
    '2 Timothy': '2timothy',
    'Titus': 'titus',
    'Philemon': 'philemon',
    'Hebrews': 'hebrews',
    'James': 'james',
    '1 Peter': '1peter',
    '2 Peter': '2peter',
    '1 John': '1john',
    '2 John': '2john',
    '3 John': '3john',
    'Jude': 'jude',
    'Revelation': 'revelation',
}

HTML_ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&#160;': ' ',
    '&#8220;': '“',
    '&#8221;': '”',
    '&#8216;': '‘',
    '&#8217;': '’',
    '&#8212;': '—',
    '&#8211;': '–',
}


def decode_entities(text):
    for entity, char in HTML_ENTITIES.items():
        text = text.replace(entity, char)
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    text = re.sub(r'&#x([0-9a-fA-F]+);', lambda m: chr(int(m.group(1), 16)), text)
    return text


def extract_chapter_verses(html, book_key, chapter_num):
    """Parse a chapter XHTML and return {verse_id: text_with_note_markers}."""

    # Step 1: Replace NET note <sup> links with markers ⟦N·nXXXXXX⟧ before stripping.
    # Pattern: <sup><a id="n010011" href="...">1</a></sup>
    html = re.sub(
        r'<sup[^>]*>\s*<a\s+id="(n[0-9a-z]+)"[^>]*>(\d+[a-z]?)</a>\s*</sup>',
        r'⟦\2·\1⟧',
        html,
        flags=re.IGNORECASE,
    )
    # Strip any remaining <sup>...</sup> (rare but possible)
    html = re.sub(r'<sup[^>]*>.*?</sup>', '', html, flags=re.DOTALL | re.IGNORECASE)

    body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if not body_m:
        return {}
    body = body_m.group(1)

    # Remove paragraph titles (section headings)
    body = re.sub(r'<p[^>]*class="paragraphtitle"[^>]*>.*?</p>', ' ', body,
                  flags=re.DOTALL | re.IGNORECASE)

    # Replace verse markers with sentinels
    body = re.sub(
        r'<span[^>]*class="verse"[^>]*>\d+:(\d+[a-z]?)</span>',
        r'§\1§',
        body,
        flags=re.IGNORECASE,
    )

    # Strip remaining HTML tags (keep note markers and verse sentinels intact)
    body = re.sub(r'<[^>]+>', ' ', body)
    body = decode_entities(body)
    body = re.sub(r'[ \t\r\n]+', ' ', body)

    raw_parts = re.split(r'§(\d+[a-z]?)§', body)
    verses = {}
    for j in range(1, len(raw_parts) - 1, 2):
        verse_num = raw_parts[j]
        text = raw_parts[j + 1].strip()
        if text:
            verse_id = f'{book_key}.{chapter_num}.{verse_num}'
            verses[verse_id] = text

    return verses


def clean_note_html(raw):
    """
    Strip the leading back-link, outer wrapper, and convert the inner
    paragraphs into display-ready HTML.
    """
    # Strip leading back-link: <a href="...">N</a> followed by optional space
    raw = re.sub(r'^\s*<a\s+href="[^"]*">\d+[a-z]?</a>\s*', '', raw.strip())

    # Strip any remaining <a> tags (keep text content)
    raw = re.sub(r'<a\s[^>]*>(.*?)</a>', r'\1', raw, flags=re.DOTALL | re.IGNORECASE)

    # Remove note-type HTML links that appear within cross-references
    raw = re.sub(r'<a\s[^>]*>', '', raw, flags=re.IGNORECASE)
    raw = raw.replace('</a>', '')

    # Normalize inner paragraphs: join adjacent </p><p> with a single <br/>
    # (The EPUB uses nested <p> which renders as double-spacing; flatten to single <br/>)
    raw = re.sub(r'\s*</p>\s*<p[^>]*>\s*', '<br/>', raw, flags=re.IGNORECASE)
    raw = re.sub(r'</?p[^>]*>', '', raw, flags=re.IGNORECASE)

    # Decode entities
    raw = decode_entities(raw)

    # Normalize whitespace
    raw = re.sub(r' +', ' ', raw).strip()
    return raw


def extract_notes_from_file(html):
    """Extract {note_id: html_content} from a _notes.xhtml file."""
    body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if not body_m:
        return {}
    body = body_m.group(1)

    notes = {}
    # Split on <p id="nXXXXXX"> markers
    parts = re.split(r'<p\s+id="(n[0-9a-z]+)"\s*>', body, flags=re.IGNORECASE)
    # parts[0] = preamble (h2, etc.)
    # parts[1] = note_id, parts[2] = content until next note, ...
    for i in range(1, len(parts) - 1, 2):
        note_id = parts[i]
        raw = parts[i + 1]

        # Strip trailing outer </p> (closing the <p id="..."> we split on)
        raw = re.sub(r'\s*</p>\s*$', '', raw.rstrip())

        cleaned = clean_note_html(raw)
        if cleaned:
            notes[note_id] = cleaned

    return notes


def main():
    if not EPUB_PATH.exists():
        print(f'ERROR: {EPUB_PATH} not found', file=sys.stderr)
        sys.exit(1)

    TRANSLATIONS_DIR.mkdir(exist_ok=True)
    NOTES_DIR.mkdir(exist_ok=True)

    all_verses = {}
    all_book_notes = {}  # book_key → {note_id: html}

    with zipfile.ZipFile(EPUB_PATH, 'r') as epub:
        toc_xml = epub.read('OEBPS/toc.ncx').decode('utf-8')
        nav_entries = re.findall(
            r'<navLabel>\s*<text>(.*?)</text>\s*</navLabel>\s*<content src="(.*?)"',
            toc_xml, re.DOTALL
        )

        books = [(n.strip(), s) for n, s in nav_entries if n.strip() in BOOK_NAME_MAP]

        if not books:
            print('ERROR: No canonical books found in toc.ncx', file=sys.stderr)
            sys.exit(1)

        print(f'Found {len(books)} books in TOC\n')

        for book_name, book_index_src in books:
            book_key = BOOK_NAME_MAP[book_name]
            book_notes = {}

            index_html = epub.read(f'OEBPS/{book_index_src}').decode('utf-8')
            chapter_links = re.findall(r'<a href="(file\d+\.xhtml)">(\d+)</a>', index_html)

            if not chapter_links:
                print(f'  {book_name}: no chapter links, skipping')
                continue

            book_verse_count = 0
            book_note_count = 0

            for chap_file, chap_num_str in chapter_links:
                chap_num = int(chap_num_str)

                try:
                    chap_html = epub.read(f'OEBPS/{chap_file}').decode('utf-8')
                except KeyError:
                    print(f'  WARNING: {chap_file} not in EPUB', file=sys.stderr)
                    continue

                verses = extract_chapter_verses(chap_html, book_key, chap_num)
                all_verses.update(verses)
                book_verse_count += len(verses)

                notes_file = chap_file.replace('.xhtml', '_notes.xhtml')
                try:
                    notes_html = epub.read(f'OEBPS/{notes_file}').decode('utf-8')
                    notes = extract_notes_from_file(notes_html)
                    book_notes.update(notes)
                    book_note_count += len(notes)
                except KeyError:
                    pass  # Some chapters have no notes file

            all_book_notes[book_key] = book_notes
            print(f'  {book_name:<22} {book_verse_count:>5} verses  {book_note_count:>6} notes')

    total_verses = len(all_verses)
    total_notes = sum(len(n) for n in all_book_notes.values())
    print(f'\nTotal: {total_verses} verses, {total_notes} notes')

    # Write translations/net.json
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_verses, f, ensure_ascii=False)
    print(f'Written: {OUTPUT_FILE}')

    # Write per-book notes files
    for book_key, notes in all_book_notes.items():
        if notes:
            notes_path = NOTES_DIR / f'{book_key}.json'
            with open(notes_path, 'w', encoding='utf-8') as f:
                json.dump(notes, f, ensure_ascii=False)
    print(f'Written: {NOTES_DIR}/ ({len([n for n in all_book_notes.values() if n])} files)')

    # Update translations-index.json
    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        index = json.load(f)

    index['translations'] = [t for t in index['translations'] if t.get('id') != 'net']
    index['translations'].append({
        'id': 'net',
        'name': 'New English Translation (NET Bible)',
        'file': 'translations/net.json',
        'license': 'Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. Used by permission. All rights reserved.',
        'source': 'NETBIBLE21.epub',
        'verse_count': total_verses,
    })

    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f'Updated: {INDEX_FILE}')


if __name__ == '__main__':
    main()
