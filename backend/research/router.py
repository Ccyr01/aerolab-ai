import csv
from typing import Literal
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError


router = APIRouter(prefix="/research", tags=["Research Analytics"])
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "research" / "observations.csv"
REPEATABILITY_PATH = DATA_PATH.with_name("repeatability_by_step.csv")
SUPERVISED_PATH = DATA_PATH.with_name("supervised_summary.csv")
ACOUSTIC_PATH = DATA_PATH.with_name("acoustic_rms.csv")
MICROPHONES = tuple(f"Mic{i}" for i in range(3, 11))


class AcousticPoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    ObservationID: str = Field(min_length=1)
    SignalIndex: int = Field(ge=0)
    DatasetName: str = Field(min_length=1)
    SequenceType: str = Field(min_length=1)
    Step: int = Field(ge=0, le=20)
    values: dict[str, float]


@router.get("/acoustic-features", response_model=list[AcousticPoint])
def get_acoustic_features(
    dataset_name: str = Query(min_length=1, max_length=200, alias="DatasetName", pattern=r"^\S(?:.*\S)?$"),
    feature: Literal["rms"] = Query(default="rms"),
):
    """Existing engineered RMS values for one complete run; no fitting or averaging."""
    records = []
    try:
        with ACOUSTIC_PATH.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            required = {"ObservationID", "SignalIndex", "DatasetName", "SequenceType", "Step",
                        *(f"{mic}_rms" for mic in MICROPHONES)}
            if set(reader.fieldnames or []) != required:
                raise ValueError("Unexpected acoustic export columns")
            for row in reader:
                if row["DatasetName"] != dataset_name:
                    continue
                point = AcousticPoint.model_validate({
                    **{key: row[key] for key in ("ObservationID", "SignalIndex", "DatasetName", "SequenceType", "Step")},
                    "values": {mic: row[f"{mic}_rms"] for mic in MICROPHONES},
                })
                if any(value < 0 for value in point.values.values()):
                    raise ValueError("Negative RMS")
                records.append(point)
        if not records:
            raise HTTPException(status_code=404, detail="Experimental run not found in acoustic export.")
        records.sort(key=lambda point: point.Step)
        if ([point.Step for point in records] != list(range(21))
                or len({point.ObservationID for point in records}) != 21
                or len({point.SignalIndex for point in records}) != 21
                or len({point.SequenceType for point in records}) != 1):
            raise ValueError("Incomplete or inconsistent acoustic run")
        return records
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Acoustic feature export is not available.") from None
    except (OSError, UnicodeError, csv.Error, ValueError, TypeError) as error:
        raise HTTPException(status_code=500, detail="Acoustic feature export is invalid or unreadable.") from error


class SupervisedResult(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    target: Literal["CL", "R"]
    model: Literal["Ridge", "RandomForest"]
    representation: Literal["Action", "Microphones", "Action + Microphones"]
    subset: Literal["Action", "5", "10", "20", "30", "50", "All"]
    n_features: float = Field(ge=0)
    R2_mean: float = Field(le=1)
    R2_std: float = Field(ge=0)
    RMSE_mean: float = Field(ge=0)
    RMSE_std: float = Field(ge=0)
    MAE_mean: float = Field(ge=0)
    MAE_std: float = Field(ge=0)


@router.get("/supervised", response_model=list[SupervisedResult])
def get_supervised():
    """Serve verified five-fold results without fitting models."""
    try:
        with SUPERVISED_PATH.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            if not set(SupervisedResult.model_fields).issubset(reader.fieldnames or []):
                raise ValueError("Missing summary columns")
            records = [SupervisedResult.model_validate(row) for row in reader]
        expected = {(t, m, r, s) for t in ("CL", "R") for m in ("Ridge", "RandomForest")
                    for r, subsets in (("Action", ("Action",)), ("Microphones", ("5", "10", "20", "30", "50", "All")),
                                       ("Action + Microphones", ("5", "10", "20", "30", "50", "All"))) for s in subsets}
        if len(records) != len(expected) or {(r.target, r.model, r.representation, r.subset) for r in records} != expected:
            raise ValueError("Incomplete or duplicate result combinations")
        for row in records:
            if row.subset != "All" and row.n_features != (0 if row.subset == "Action" else int(row.subset)):
                raise ValueError("Inconsistent microphone feature count")
            if row.subset == "All" and row.n_features < 50:
                raise ValueError("Invalid retained feature count")
        return records
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Supervised summary is not available.") from None
    except (OSError, UnicodeError, csv.Error, ValueError) as error:
        raise HTTPException(status_code=500, detail="Supervised summary is invalid or unreadable.") from error
SEQUENCE_GROUPS = ("ascending", "descending", *(f"random_{i}" for i in range(1, 6)))
LiteralSequence = Literal["ascending", "descending", "random_1", "random_2", "random_3", "random_4", "random_5"]


class RepeatabilityPoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    SequenceGroup: LiteralSequence
    Step: int = Field(ge=0, le=20)
    CurrentAction: float = Field(ge=0, le=20)
    Mean_Delta_Cl: float
    SD_Delta_Cl: float = Field(ge=0)
    RunCount: int = Field(ge=2)


@router.get("/repeatability", response_model=dict[str, list[RepeatabilityPoint]])
def get_repeatability():
    """Verified per-step means and sample SD; no recomputation or training."""
    groups = {name: [] for name in SEQUENCE_GROUPS}
    try:
        with REPEATABILITY_PATH.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            if not set(RepeatabilityPoint.model_fields).issubset(reader.fieldnames or []):
                raise ValueError("Missing summary columns")
            for row in reader:
                point = RepeatabilityPoint.model_validate(row)
                groups[point.SequenceGroup].append(point)
        for points in groups.values():
            points.sort(key=lambda point: point.Step)
            if [point.Step for point in points] != list(range(21)):
                raise ValueError("Expected each experimental step exactly once")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Repeatability summary is not available.") from None
    except (OSError, UnicodeError, csv.Error, ValueError) as error:
        raise HTTPException(status_code=500, detail="Repeatability summary is invalid or unreadable.") from error
    return groups


class ResearchRun(BaseModel):
    DatasetName: str = Field(min_length=1)
    SequenceType: str = Field(min_length=1)


@router.get("/runs", response_model=list[ResearchRun])
def get_runs():
    runs = {}
    try:
        with DATA_PATH.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            fields = ResearchRun.model_fields
            if not set(fields).issubset(reader.fieldnames or []):
                raise HTTPException(status_code=500, detail="Research dataset is missing required columns.")
            for row in reader:
                run = ResearchRun.model_validate({key: row[key] for key in fields})
                if run.DatasetName in runs and runs[run.DatasetName].SequenceType != run.SequenceType:
                    raise HTTPException(status_code=500, detail="Research dataset has conflicting sequence types for a run.")
                runs[run.DatasetName] = run
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Research observations dataset is not available.") from None
    except (OSError, UnicodeError, csv.Error, ValidationError) as error:
        raise HTTPException(status_code=500, detail="Research observations dataset could not be read or contains invalid records.") from error
    return [runs[name] for name in sorted(runs)]


class ActionLiftRecord(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    ObservationID: str
    DatasetName: str
    Step: int = Field(ge=0)
    SequenceType: str
    CurrentAction: float
    Delta_Cl: float


@router.get("/action-lift", response_model=list[ActionLiftRecord])
def get_action_lift(
    dataset_name: str | None = Query(
        default=None, alias="DatasetName", min_length=1, max_length=200,
        pattern=r"^\S(?:.*\S)?$",
        description="Exact experimental run name, for example downward_01.",
    ),
    limit: int = Query(default=200, ge=1, le=200),
):
    records = []
    try:
        with DATA_PATH.open(newline="", encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)
            fields = ActionLiftRecord.model_fields
            if not set(fields).issubset(reader.fieldnames or []):
                raise HTTPException(status_code=500, detail="Research dataset is missing required columns.")
            for row in reader:
                if dataset_name is not None and row["DatasetName"] != dataset_name:
                    continue
                records.append(ActionLiftRecord.model_validate({key: row[key] for key in fields}))
                if len(records) >= limit:
                    break
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Research observations dataset is not available.") from None
    except (OSError, UnicodeError, csv.Error, ValidationError) as error:
        raise HTTPException(status_code=500, detail="Research observations dataset could not be read or contains invalid records.") from error
    return records
