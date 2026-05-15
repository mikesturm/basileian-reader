#!/usr/bin/env python3
"""
Convert CrossWire SWORD zcom4 JFB module to commentary/jfb.json.
Keys: book.chapter.verse (e.g. mark.1.1)

Verse tables verified against empirical bzv slot counts.
"""

import struct
import zlib
import re
import json
import sys

MODULE_DIR = '/tmp/jfb_module/modules/comments/zcom/jfb'
OUT_PATH = '/home/user/basileian-reader/commentary/jfb.json'

# ---------------------------------------------------------------------------
# KJV canonical verse counts verified against empirical bzv slot counts.
# Negative chapter entry = no chapter intro slot in that module (2John).
# ---------------------------------------------------------------------------

NT_BOOKS = [
    ('matthew',       [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20]),
    ('mark',          [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20]),
    ('luke',          [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53]),
    ('john',          [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25]),
    ('acts',          [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,29,35,28,27,32,44,31]),
    ('romans',        [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27]),
    ('1corinthians',  [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24]),
    ('2corinthians',  [24,17,18,18,21,18,16,24,15,18,33,21,14]),
    ('galatians',     [24,21,29,31,26,18]),
    ('ephesians',     [23,22,21,32,33,24]),
    ('philippians',   [30,30,21,23]),
    ('colossians',    [29,23,25,18]),
    ('1thessalonians',[10,20,13,18,28]),
    ('2thessalonians',[12,17,18]),
    ('1timothy',      [20,15,16,16,25,21]),
    ('2timothy',      [18,26,17,22]),
    ('titus',         [16,15,15]),
    ('philemon',      [25]),
    ('hebrews',       [14,18,19,16,14,20,28,13,28,39,40,29,25]),
    ('james',         [27,26,18,17,20]),
    ('1peter',        [25,25,22,19,14]),
    ('2peter',        [21,22,18]),
    ('1john',         [10,29,24,21,21]),
    ('2john',         [12]),    # standard: 1+1+12=14 slots; verse 13 has no JFB slot
    ('3john',         [0, 14]), # 2 intro slots + 14 verses; 17 slots = 1+1+1+14
    ('jude',          [25]),
    ('revelation',    [20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]),
]

OT_BOOKS = [
    ('genesis',        [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26]),
    ('exodus',         [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38]),
    ('leviticus',      [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34]),
    ('numbers',        [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13]),
    ('deuteronomy',    [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12]),
    ('joshua',         [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33]),
    ('judges',         [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25]),
    ('ruth',           [22,23,18,22]),
    ('1samuel',        [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13]),
    ('2samuel',        [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25]),
    ('1kings',         [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53]),
    ('2kings',         [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30]),
    ('1chronicles',    [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30]),
    ('2chronicles',    [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23]),
    ('ezra',           [11,70,13,24,17,22,28,36,15,44]),
    ('nehemiah',       [11,20,32,23,19,19,73,18,38,39,36,47,31]),
    ('esther',         [22,23,15,17,14,14,10,17,32,3]),
    ('job',            [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17]),
    ('psalms',         [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6]),
    ('proverbs',       [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31]),
    ('ecclesiastes',   [18,26,22,16,20,12,29,17,18,20,10,14]),
    ('songofsolomon',  [17,17,11,16,16,13,13,14]),
    ('isaiah',         [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24]),
    ('jeremiah',       [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34]),
    ('lamentations',   [22,22,66,22,22]),
    ('ezekiel',        [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35]),
    ('daniel',         [21,49,30,37,31,28,28,27,27,21,45,13]),
    ('hosea',          [11,23,5,19,15,11,16,14,17,15,12,14,16,9]),
    ('joel',           [20,32,21]),
    ('amos',           [15,16,15,13,27,14,17,14,15]),
    ('obadiah',        [21]),
    ('jonah',          [17,10,10,11]),
    ('micah',          [16,13,12,13,15,16,20]),
    ('nahum',          [15,13,19]),
    ('habakkuk',       [17,20,19]),
    ('zephaniah',      [18,15,20]),
    ('haggai',         [15,23]),
    ('zechariah',      [21,13,10,14,11,15,14,23,17,12,17,14,9,21]),
    ('malachi',        [14,17,18,6]),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def strip_osis(text):
    t = re.sub(r'<[^>]+>', ' ', text)
    t = re.sub(r'&amp;', '&', t)
    t = re.sub(r'&lt;', '<', t)
    t = re.sub(r'&gt;', '>', t)
    t = re.sub(r'&apos;', "'", t)
    t = re.sub(r'&quot;', '"', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def find_zlib_streams_exact(data):
    streams = []
    i = 0
    while i < len(data) - 1:
        if data[i] == 0x78 and data[i+1] in (0x01, 0x5e, 0x9c, 0xda):
            try:
                d = zlib.decompressobj()
                dec = d.decompress(data[i:])
                unused_len = len(d.unused_data)
                stream_end = len(data) - unused_len
                streams.append(dec)
                i = stream_end
                continue
            except Exception:
                pass
        i += 1
    return streams

def read_bzv(bzv_data):
    n = len(bzv_data) // 12
    return [struct.unpack_from('<iii', bzv_data, i * 12) for i in range(n)]

def build_verse_ids(books):
    """
    Build verse ID list matching sequential bzv slot positions.
    Two leading Nones = bible + testament intro.
    Per book: None (book intro) + per chapter: (None intro if positive, then verses).
    Negative chapter value = no chapter intro slot for that chapter.
    Zero chapter value = chapter intro slot only, no verses (extra intro slot).
    real_ch increments only when verses are actually generated.
    """
    ids = [None, None]
    for book_name, chap_verses in books:
        ids.append(None)  # book intro
        real_ch = 0
        for n_verses in chap_verses:
            if n_verses < 0:
                n_verses = -n_verses
                # No chapter intro slot
            else:
                ids.append(None)  # chapter intro
            if n_verses > 0:
                real_ch += 1
                for v_num in range(1, n_verses + 1):
                    ids.append(f'{book_name}.{real_ch}.{v_num}')
    return ids

def extract_testament(bzv_data, bzz_data, books, label):
    streams = find_zlib_streams_exact(bzz_data)
    entries = read_bzv(bzv_data)
    verse_ids = build_verse_ids(books)

    n_entries = len(entries)
    n_ids = len(verse_ids)
    print(f'  {label}: streams={len(streams)}, bzv={n_entries}, verse_ids={n_ids}', end='')
    if n_ids == n_entries:
        print(' ✓')
    else:
        print(f' WARNING: off by {n_ids - n_entries}')

    result = {}
    n = min(n_ids, n_entries)
    for i in range(n):
        vid = verse_ids[i]
        if vid is None:
            continue
        blk, start, size = entries[i]
        if size <= 0 or blk >= len(streams):
            continue
        stream = streams[blk]
        if start + size > len(stream):
            continue
        raw = stream[start:start+size]
        try:
            text = raw.decode('utf-8', errors='replace')
        except Exception:
            continue
        text = strip_osis(text)
        if text:
            result[vid] = text

    return result

# ---------------------------------------------------------------------------
# Verification helpers
# ---------------------------------------------------------------------------

def verify_tables(books, label, expected_slots_by_name):
    """Check that each book's table gives the expected slot count."""
    errors = []
    for book_name, chap_verses in books:
        # Positive (including 0) entries each add a chapter intro slot
        n_intros = sum(1 for v in chap_verses if v >= 0)
        n_verses = sum(abs(v) for v in chap_verses)
        slots = 1 + n_intros + n_verses
        expected = expected_slots_by_name.get(book_name)
        if expected and slots != expected:
            errors.append(f'  {book_name}: computed={slots} expected={expected} (off by {slots-expected})')
    if errors:
        print(f'\n{label} table errors:')
        for e in errors:
            print(e)
    else:
        print(f'  {label} tables: all OK')
    return len(errors) == 0

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Expected slot counts from empirical bzv analysis
    NT_SLOTS = {
        'matthew':1100,'mark':695,'luke':1176,'john':901,'acts':1036,
        'romans':450,'1corinthians':454,'2corinthians':271,'galatians':156,
        'ephesians':162,'philippians':109,'colossians':100,'1thessalonians':95,
        '2thessalonians':51,'1timothy':120,'2timothy':88,'titus':50,
        'philemon':27,'hebrews':317,'james':114,'1peter':111,'2peter':65,
        '1john':111,'2john':14,'3john':17,'jude':27,'revelation':427
    }
    # Note: 2john [12] = 1+1+12=14 ✓; 3john [0,14] = 1+1+1+14=17 ✓
    OT_SLOTS = {
        'genesis':1584,'exodus':1254,'leviticus':887,'numbers':1325,'deuteronomy':994,
        'joshua':683,'judges':640,'ruth':90,'1samuel':842,'2samuel':720,
        '1kings':839,'2kings':745,'1chronicles':972,'2chronicles':859,'ezra':291,
        'nehemiah':420,'esther':178,'job':1113,'psalms':2612,'proverbs':947,
        'ecclesiastes':235,'songofsolomon':126,'isaiah':1359,'jeremiah':1417,
        'lamentations':160,'ezekiel':1322,'daniel':370,'hosea':212,'joel':77,
        'amos':156,'obadiah':23,'jonah':53,'micah':113,'nahum':51,'habakkuk':60,
        'zephaniah':57,'haggai':41,'zechariah':226,'malachi':60
    }

    print('Verifying tables...')
    ok_nt = verify_tables(NT_BOOKS, 'NT', NT_SLOTS)
    ok_ot = verify_tables(OT_BOOKS, 'OT', OT_SLOTS)
    if not (ok_nt and ok_ot):
        print('\nAborting due to table errors.')
        sys.exit(1)

    base = MODULE_DIR
    print('\nLoading NT files...')
    nt_bzv = open(f'{base}/nt.bzv', 'rb').read()
    nt_bzz = open(f'{base}/nt.bzz', 'rb').read()

    print('Loading OT files...')
    ot_bzv = open(f'{base}/ot.bzv', 'rb').read()
    ot_bzz = open(f'{base}/ot.bzz', 'rb').read()

    print('\nExtracting:')
    nt_result = extract_testament(nt_bzv, nt_bzz, NT_BOOKS, 'NT')
    ot_result = extract_testament(ot_bzv, ot_bzz, OT_BOOKS, 'OT')

    combined = {}
    combined.update(ot_result)
    combined.update(nt_result)

    print(f'\nTotal entries: {len(combined)}')

    print('\nSpot checks:')
    for check_id in ['genesis.1.1', 'psalms.23.1', 'mark.1.1', 'matthew.5.3', 'john.3.16', '1corinthians.15.3', '2john.1.1', '3john.1.15']:
        text = combined.get(check_id, '(NOT FOUND)')
        print(f'  {check_id}: {text[:90]}')

    import os
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    print(f'\nWriting to {OUT_PATH}...')
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(OUT_PATH)
    print(f'Done. File size: {size:,} bytes ({size/1024/1024:.1f} MB)')

if __name__ == '__main__':
    main()
