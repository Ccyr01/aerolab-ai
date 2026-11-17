"""Deterministically export existing RMS cells; no feature extraction or fitting.

Run from the repository root: python scripts/export_acoustic_features.py
"""
import csv
import io
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MICROPHONES = tuple(f"Mic{i}" for i in range(3, 11))
COLUMNS = ("ObservationID", "SignalIndex", "DatasetName", "SequenceType", "Step",
           *(f"{mic}_rms" for mic in MICROPHONES))


def export_text(data_dir=ROOT / "data" / "research"):
    def read(name):
        with (data_dir / name).open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))
    features = read("features.csv")
    observations = read("observations.csv")
    indexed = {row["ObservationID"]: row for row in features}
    if len(indexed) != len(features) or len({r["ObservationID"] for r in observations}) != len(observations):
        raise ValueError("Duplicate observation identifiers")
    if set(indexed) != {row["ObservationID"] for row in observations}:
        raise ValueError("Observation identifiers do not align")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    runs = {}
    for row in sorted(observations, key=lambda r: (r["DatasetName"], int(r["Step"]))):
        source = indexed[row["ObservationID"]]
        if source["SignalIndex"] != row["SignalIndex"]:
            raise ValueError("SignalIndex mismatch")
        step = int(row["Step"])
        run = runs.setdefault(row["DatasetName"], [])
        run.append(step)
        cells = {key: row[key] for key in COLUMNS[:5]}
        for mic in MICROPHONES:
            key = f"{mic}_rms"
            value = source[key]
            if not math.isfinite(float(value)) or float(value) < 0:
                raise ValueError("Invalid RMS value")
            cells[key] = value  # Preserve original decimal text, without rounding.
        writer.writerow(cells)
    if any(steps != list(range(21)) for steps in runs.values()):
        raise ValueError("Expected each step 0-20 exactly once per run")
    return output.getvalue()


if __name__ == "__main__":
    destination = ROOT / "data" / "research" / "acoustic_rms.csv"
    destination.write_bytes(export_text().encode("utf-8"))
    print(f"Exported {destination.name}: {destination.stat().st_size:,} bytes")
