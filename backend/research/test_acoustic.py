import asyncio
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import patch

from fastapi import FastAPI
from backend.research import router
from scripts.export_acoustic_features import ROOT, export_text


def request(query):
    async def run():
        app = FastAPI()
        app.include_router(router.router)
        messages = []
        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}
        async def send(message):
            messages.append(message)
        await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                   "method": "GET", "scheme": "http", "path": "/research/acoustic-features",
                   "query_string": urlencode(query).encode(), "headers": [],
                   "server": ("test", 80), "client": ("test", 1), "root_path": ""}, receive, send)
        return messages[0]["status"], json.loads(b"".join(m.get("body", b"") for m in messages[1:]))
    return asyncio.run(run())


class AcousticTests(unittest.TestCase):
    @unittest.skipUnless((ROOT / "data/research/features.csv").is_file(), "Requires the local, intentionally unpublished feature matrix")
    def test_export_exact_cells_alignment_and_determinism(self):
        directory = ROOT / "data" / "research"
        result = export_text()
        self.assertEqual(result, (directory / "acoustic_rms.csv").read_text(encoding="utf-8"))
        self.assertEqual(result, export_text())
        def read(name):
            with (directory / name).open(encoding="utf-8-sig", newline="") as f:
                return {r["ObservationID"]: r for r in csv.DictReader(f)}
        source = read("features.csv")
        observations = read("observations.csv")
        exported = list(csv.DictReader(io.StringIO(result)))
        self.assertEqual(len(exported), 3276)
        self.assertEqual({r["ObservationID"] for r in exported}, set(source))
        self.assertEqual(len({r["DatasetName"] for r in exported}), 156)
        for row in exported:
            original = observations[row["ObservationID"]]
            for key in ("ObservationID", "SignalIndex", "DatasetName", "SequenceType", "Step"):
                self.assertEqual(row[key], original[key])
            for mic in router.MICROPHONES:
                self.assertEqual(row[f"{mic}_rms"], source[row["ObservationID"]][f"{mic}_rms"])
        for run in {r["DatasetName"] for r in exported}:
            self.assertEqual([int(r["Step"]) for r in exported if r["DatasetName"] == run], list(range(21)))

    def test_every_run_and_channel_matches_export(self):
        with router.ACOUSTIC_PATH.open(newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        for name in sorted({r["DatasetName"] for r in rows}):
            records = router.get_acoustic_features(name, "rms")
            expected = [r for r in rows if r["DatasetName"] == name]
            self.assertEqual([r.Step for r in records], list(range(21)))
            for record, source in zip(records, expected):
                self.assertEqual(record.ObservationID, source["ObservationID"])
                self.assertEqual(record.values, {mic: float(source[f"{mic}_rms"]) for mic in router.MICROPHONES})

    def test_http_validation_and_success(self):
        status, rows = request({"DatasetName": "downward_01", "feature": "rms"})
        self.assertEqual(status, 200)
        self.assertEqual(len(rows), 21)
        self.assertEqual(rows[0]["Step"], 0)
        self.assertEqual(set(rows[0]["values"]), set(router.MICROPHONES))
        for query in ({}, {"DatasetName": ""}, {"DatasetName": " x "},
                      {"DatasetName": "x" * 201}, {"DatasetName": "downward_01", "feature": "energy"}):
            self.assertEqual(request(query)[0], 422)
        self.assertEqual(request({"DatasetName": "missing"})[0], 404)
        self.assertEqual(request({"DatasetName": "../../features.csv"})[0], 404)

    def test_missing_and_corrupt_export_fail_safely(self):
        with patch.object(router, "ACOUSTIC_PATH", Path("missing-acoustic.csv")):
            self.assertEqual(request({"DatasetName": "downward_01"})[0], 404)
        original = router.ACOUSTIC_PATH.read_text()
        lines = original.splitlines()
        for content in ("wrong,columns\n1,2\n", "\n".join(lines[:21]),
                        original + lines[1] + "\n", original.replace(lines[1].split(',')[5], "nan", 1)):
            with tempfile.TemporaryDirectory() as temp:
                path = Path(temp) / "acoustic.csv"
                path.write_text(content)
                with patch.object(router, "ACOUSTIC_PATH", path):
                    self.assertEqual(request({"DatasetName": "downward_01"})[0], 500)

    @unittest.skipUnless((ROOT / "data/research/features.csv").is_file(), "Requires the local, intentionally unpublished feature matrix")
    def test_export_rejects_misaligned_sources(self):
        directory = ROOT / "data" / "research"
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            (target / "features.csv").write_bytes((directory / "features.csv").read_bytes())
            original = (directory / "observations.csv").read_text(encoding="utf-8-sig")
            (target / "observations.csv").write_text(original.replace("downward_01_step00,0,", "downward_01_step00,99999,", 1))
            with self.assertRaisesRegex(ValueError, "SignalIndex"):
                export_text(target)
