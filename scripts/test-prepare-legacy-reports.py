import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-legacy-reports.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class PrepareTests(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(m.number('150.243'), 150243)
        self.assertEqual(m.number('247.665,00', money=True), 247665)
        self.assertEqual(m.number('Rp383,60', money=True), 383.6)
        for raw in ['', '0.42', '9,595', '-1', '=1+1']:
            with self.assertRaises(ValueError): m.number(raw)
    def test_meta_platform_aliases_cannot_duplicate_daily_totals(self):
        row = ['2024-5-2 15:3:9', 'Wahib', '2024-05-01', 'Facebook', 'Product', '150.243', '1.234', '20', '2', 'Notes', '0']
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'source.csv'
            with path.open('w', newline='') as f:
                w=csv.writer(f); w.writerow(m.HEADERS); w.writerow(row)
                row[3]='Instagram';w.writerow(row)
            result=m.prepare(path)
            self.assertEqual(result['readyRows'],0)
            self.assertEqual(result['heldRows'],2)

    def test_filter_identity_and_duplicates(self):
        row = ['2024-5-2 15:3:9', 'Fadhilah', '2024-05-01', 'Facebook', 'Product', '150.243', '1.234', '20', '2', 'Notes', '0']
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'source.csv'
            with path.open('w', newline='') as f:
                w = csv.writer(f);w.writerow(m.HEADERS)
                w.writerow(row)
                w.writerow(row[:10]+['Off'])
                w.writerow(row[:10]+['10.237'])
            result = m.prepare(path)
            self.assertEqual(result['readyRows'], 1)
            self.assertEqual(result['rows'][0]['name'], 'fadhilah')
            self.assertEqual(result['rows'][0]['spent'], 150243)
            self.assertEqual(result['skipped'], {'Off': 1, '10.237': 1})
            with path.open('a', newline='') as f:csv.writer(f).writerow(row)
            self.assertEqual(m.prepare(path)['readyRows'], 0)
            result = m.prepare(path, 'latest')
            self.assertEqual(result['readyRows'], 1)
            self.assertEqual(result['rows'][0]['line'], 5)
            self.assertEqual(result['heldRows'], 1)
if __name__ == '__main__':unittest.main()
