"""Prepare an auditable import plan; never connects to or modifies the database.

Column positions are intentional: the legacy CSV contains two Timestamp headers.
Only the explicitly authorized ID '0' is eligible. Unknown/ambiguous data is held.
"""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

NAMES = {'khabib', 'ryant', 'wahib', 'fadhilah', 'thoha', 'rizqi', 'nabilla'}
PLATFORMS = {'facebook': 'meta', 'instagram': 'meta', 'google': 'google', 'tiktok': 'tiktok'}
HEADERS = ['Timestamp', 'Timestamp', 'Date', 'Platform', 'Product', 'Spent', 'Impression', 'Click', 'Result Lead', 'Catatan', 'ID']

def number(raw, money=False):
    raw = raw.strip()
    if money:
        raw = re.sub(r"^Rp\s*", "", raw, flags=re.I)
    if not re.fullmatch(r'(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?', raw):
        raise ValueError('Angka kosong atau format ambigu: ' + repr(raw))
    from decimal import Decimal
    value = Decimal(raw.replace('.', '').replace(',', '.'))
    if not money and value != int(value):
        raise ValueError('Metrik hitungan harus bulat: ' + repr(raw))
    if value > 2147483647:
        raise ValueError('Angka melebihi batas database')
    return float(value) if money else int(value)

def stamp(raw):
    match = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})', raw.strip())
    if not match:
        raise ValueError('Timestamp tidak valid')
    return dt.datetime(*map(int, match.groups()), tzinfo=dt.timezone(dt.timedelta(hours=7))).isoformat()

def prepare(path, duplicate_policy='hold'):
    content = path.read_bytes()
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        if next(reader)[:11] != HEADERS:
            raise ValueError('Header tidak sesuai template laporan lama')
        rows = list(reader)
    rejected, candidates, skipped = [], [], collections.Counter()
    groups = collections.defaultdict(list)
    for line, raw in enumerate(rows, 2):
        if len(raw) < 11:
            rejected.append({'line': line, 'reason': 'Kolom tidak lengkap', 'raw': raw})
            continue
        flag = raw[10].strip()
        if flag != '0':
            skipped[flag] += 1
            continue
        if not any(x.strip() for x in raw[:10]):
            skipped['empty'] += 1
            continue
        # Group before validation: a corrupt revision must not allow a stale row in.
        key = tuple(raw[i].strip().casefold() for i in (1, 2, 3, 4))
        normalized_key = (key[0], key[1], PLATFORMS.get(key[2], key[2]), key[3])
        groups[normalized_key].append((line, raw))
    for key, group in groups.items():
        if len(group) > 1:
            if duplicate_policy == 'hold':
                rejected.extend({'line': line, 'reason': 'Kelompok duplikat orang/tanggal/platform/produk', 'raw': raw} for line, raw in group)
                continue
            try:
                ordered = sorted(group, key=lambda item: (stamp(item[1][0]), item[0]))
            except ValueError:
                rejected.extend({'line': line, 'reason': 'Timestamp kelompok duplikat tidak valid', 'raw': raw} for line, raw in group)
                continue
            for line, raw in ordered[:-1]:
                rejected.append({'line': line, 'reason': 'Revisi lama; timestamp terbaru, lalu posisi baris terakhir dipilih', 'raw': raw})
            group = ordered[-1:]
        line, raw = group[0]
        try:
            name, date, platform, product = tuple(raw[i].strip().casefold() for i in (1, 2, 3, 4))
            if name not in NAMES:
                raise ValueError('Nama belum dipetakan')
            if platform not in PLATFORMS:
                raise ValueError('Platform perlu pemetaan manual: ' + platform)
            if dt.date.fromisoformat(date).isoformat() != date or date >= dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).date().isoformat():
                raise ValueError('Tanggal harus valid dan sebelum hari ini')
            if not product or len(raw[4].strip()) > 120:
                raise ValueError('Nama produk tidak valid')
            spent = number(raw[5], money=True)
            impressions, clicks, leads = map(number, raw[6:9])
            candidates.append({'line': line, 'name': name, 'date': date, 'platform': PLATFORMS[platform], 'originalPlatform': raw[3], 'product': raw[4].strip(), 'spent': spent, 'impressions': impressions, 'clicks': clicks, 'leads': leads, 'notes': raw[9], 'submittedAt': stamp(raw[0]), 'sourceRowHash': hashlib.sha256(json.dumps(raw[:12], ensure_ascii=False).encode()).hexdigest()})
        except ValueError as error:
            rejected.append({'line': line, 'reason': str(error), 'raw': raw})
    return {'source': path.name, 'sha256': hashlib.sha256(content).hexdigest(), 'duplicatePolicy': duplicate_policy, 'totalRows': len(rows), 'eligibleId': '0', 'skipped': dict(skipped), 'readyRows': len(candidates), 'readyByName': dict(collections.Counter(r['name'] for r in candidates)), 'heldRows': len(rejected), 'heldReasons': dict(collections.Counter(r['reason'] for r in rejected)), 'rows': candidates, 'held': rejected}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--duplicates', choices=['hold', 'latest'], default='hold')
    args = parser.parse_args()
    plan = prepare(args.csv, args.duplicates)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, ensure_ascii=False, indent=2))
    args.output.chmod(0o600)
    print(json.dumps({k: v for k, v in plan.items() if k not in ('rows', 'held')}, ensure_ascii=False, indent=2))
