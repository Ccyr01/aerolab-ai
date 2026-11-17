import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import FastAPI, HTTPException
from backend.research import router


class SupervisedTests(unittest.TestCase):
    def test_verified_records_preserved(self):
        records = router.get_supervised()
        with router.SUPERVISED_PATH.open(newline="", encoding="utf-8-sig") as file:
            source = list(csv.DictReader(file))
        self.assertEqual(len(records), 52)
        for record, row in zip(records, source):
            self.assertEqual(record.model_dump(), router.SupervisedResult.model_validate(row).model_dump())
        app = FastAPI()
        app.include_router(router.router)
        self.assertEqual(set(app.openapi()['paths']['/research/supervised']), {'get'})

    def test_missing_file(self):
        with patch.object(router, 'SUPERVISED_PATH', Path('missing-supervised.csv')):
            with self.assertRaises(HTTPException) as result:
                router.get_supervised()
        self.assertEqual(result.exception.status_code, 404)

    def test_invalid_summary_rejected(self):
        original = router.SUPERVISED_PATH.read_text()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'summary.csv'
            for content in ('bad,columns\n1,2\n', '\n'.join(original.splitlines()[:-1]),
                            original + original.splitlines()[1] + '\n',
                            original.replace(',177.8,', ',nan,', 1),
                            original.replace(',5,5.0,', ',5,6.0,', 1)):
                path.write_text(content)
                with patch.object(router, 'SUPERVISED_PATH', path):
                    with self.assertRaises(HTTPException) as result:
                        router.get_supervised()
                self.assertEqual(result.exception.status_code, 500)
