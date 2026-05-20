#!/usr/bin/env python3
"""
convert-epub-net.py

Extracts all verses from NETBIBLE21.epub and writes them to
translations/net.json in the Basileian Reader's canonical flat format:
  { "genesis.1.1": "In the beginning...", ... }

Also updates translations-index.json to register the NET translation.

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
    # Decode remaining numeric entities
    text = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), text)
    text = re.sub(r'&#x([0-9a-fA-F]+);', lambda m: chr(int(m.group(1), 16)), text)
    return text


def extract_chapter_verses(html, book_key, chapter_num):
    """Parse a chapter XHTML file and return {verse_id: text} dict."""
    # Remove footnote superscripts (may contain nested tags)
    html = re.sub(r'<sup[^>]*>.*?</sup>', '', html, flags=re.DOTALL | re.IGNORECASE)

    # Extract body content
    body_m = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    if not body_m:
        return {}
    body = body_m.group(1)

    # Remove paragraph titles (section headings, not verse text)
    body = re.sub(r'<p[^>]*class="paragraphtitle"[^>]*>.*?</p>', ' ', body,
                  flags=re.DOTALL | re.IGNORECASE)

    # Replace verse markers with sentinels: <span class="verse">1:1</span> → §1§
    body = re.sub(
        r'<span[^>]*class="verse"[^>]*>\d+:(\d+[a-z]?)</span>',
        r'§\1§',
        body,
        flags=re.IGNORECASE,
    )

    # Strip all remaining HTML tags
    body = re.sub(r'<[^>]+>', ' ', body)

    # Decode HTML entities
    body = decode_entities(body)

    # Normalize whitespace
    body = re.sub(r'[ \t\r\n]+', ' ', body)

    # Split on verse sentinels and build verse map
    verses = {}
    segments = body.split('§')
    i = 0
    while i < len(segments):
        seg = segments[i]
        # After a split on '§', structure is: [..., verse_num, text, verse_num, text, ...]
        # Odd indices are verse numbers, even indices are text between markers
        # Actually split('§') gives alternating [pre, num, text, num, text, ...]
        i += 1

    # Re-parse: split gives [pre_text, verse_num, text, verse_num, text, ...]
    # where every 2-element pair (verse_num, text) follows the sentinel pattern §num§
    raw_parts = re.split(r'§(\d+[a-z]?)§', body)
    # raw_parts[0] = text before first verse marker (headers, etc.)
    # raw_parts[1] = verse num, raw_parts[2] = verse text, ...
    for j in range(1, len(raw_parts) - 1, 2):
        verse_num = raw_parts[j]
        text = raw_parts[j + 1].strip()
        # Strip trailing whitespace / punctuation artifacts at chapter boundaries
        text = text.rstrip()
        if text:
            verse_id = f'{book_key}.{chapter_num}.{verse_num}'
            verses[verse_id] = text

    return verses


def main():
    if not EPUB_PATH.exists():
        print(f'ERROR: {EPUB_PATH} not found', file=sys.stderr)
        sys.exit(1)

    TRANSLATIONS_DIR.mkdir(exist_ok=True)

    all_verses = {}

    with zipfile.ZipFile(EPUB_PATH, 'r') as epub:
        # Parse toc.ncx to get ordered list of book names and their index files
        toc_xml = epub.read('OEBPS/toc.ncx').decode('utf-8')
        nav_entries = re.findall(
            r'<navLabel>\s*<text>(.*?)</text>\s*</navLabel>\s*<content src="(.*?)"',
            toc_xml, re.DOTALL
        )

        books = []
        for name, src in nav_entries:
            name = name.strip()
            if name in BOOK_NAME_MAP:
                books.append((name, src))

        if not books:
            print('ERROR: No canonical books found in toc.ncx', file=sys.stderr)
            sys.exit(1)

        print(f'Found {len(books)} books in TOC\n')

        for book_name, book_index_src in books:
            book_key = BOOK_NAME_MAP[book_name]

            # Read book index file to get chapter → file mapping
            index_html = epub.read(f'OEBPS/{book_index_src}').decode('utf-8')
            chapter_links = re.findall(
                r'<a href="(file\d+\.xhtml)">(\d+)</a>',
                index_html
            )

            if not chapter_links:
                print(f'  {book_name}: no chapter links found, skipping')
                continue

            book_verse_count = 0
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

            print(f'  {book_name:<22} {book_verse_count:>5} verses')

    total = len(all_verses)
    print(f'\nTotal: {total} verses')

    # Write translations/net.json
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_verses, f, ensure_ascii=False)
    print(f'Written: {OUTPUT_FILE}')

    # Update translations-index.json
    with open(INDEX_FILE, 'r', encoding='utf-8') as f:
        index = json.load(f)

    # Remove any existing net entry
    index['translations'] = [t for t in index['translations'] if t.get('id') != 'net']

    index['translations'].append({
        'id': 'net',
        'name': 'New English Translation (NET Bible)',
        'file': 'translations/net.json',
        'license': 'Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. Used by permission. All rights reserved.',
        'source': 'NETBIBLE21.epub',
        'verse_count': total,
    })

    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f'Updated: {INDEX_FILE}')


if __name__ == '__main__':
    main()
