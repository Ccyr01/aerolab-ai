import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from backend.research import router


class RepeatabilityTests(unittest.TestCase):
    def test_verified_summary_and_acquisition_order(self):
        groups = router.get_repeatability()
        self.assertEqual(list(groups), list(router.SEQUENCE_GROUPS))
        with router.REPEATABILITY_PATH.open(newline="", encoding="utf-8-sig") as file:
            source = list(csv.DictReader(file))
        self.assertEqual(sum(map(len, groups.values())), len(source))
        for name, points in groups.items():
            self.assertEqual([point.Step for point in points], list(range(21)))
            self.assertEqual({point.RunCount for point in points},
                             {30 if name == "ascending" else 76 if name == "descending" else 10})
            for point in points:
                original = next(row for row in source if row["SequenceGroup"] == name and int(row["Step"]) == point.Step)
                for field in ("CurrentAction", "Mean_Delta_Cl", "SD_Delta_Cl"):
                    self.assertEqual(getattr(point, field), float(original[field]))
        self.assertNotEqual([p.CurrentAction for p in groups["random_1"]], sorted(p.CurrentAction for p in groups["random_1"]))

    def test_missing_summary(self):
        with patch.object(router, "REPEATABILITY_PATH", Path("missing-repeatability.csv")):
            with self.assertRaises(HTTPException) as result:
                router.get_repeatability()
        self.assertEqual(result.exception.status_code, 404)

    def test_invalid_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "summary.csv"
            for content in ("wrong,columns\n1,2\n", router.REPEATABILITY_PATH.read_text().replace("ascending,1,1,", "ascending,0,1,", 1),
                            router.REPEATABILITY_PATH.read_text().replace("ascending,1,1,", "ascending,1,nan,", 1)):
                path.write_text(content)
                with patch.object(router, "REPEATABILITY_PATH", path):
                    with self.assertRaises(HTTPException) as result:
                        router.get_repeatability()
                self.assertEqual(result.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
