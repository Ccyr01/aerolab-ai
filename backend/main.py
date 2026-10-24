
from pathlib import Path
import numpy as np
import json
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import threading
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Literal
from experiment_runner import run_experiment

app = FastAPI(
    title="AeroLab AI API",
    description="Machine learning predictions for airfoil noise.",
    version="1.0.0",
)

training_lock = threading.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        *[
            origin.strip().rstrip("/")
            for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Load the model saved by train_model.py
MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "airfoil_model.joblib"
)

saved = joblib.load(MODEL_PATH)
model = saved["model"]
features = saved["features"]
model_name = saved["model_name"]


class AirfoilInput(BaseModel):
    frequency: float = Field(gt=0)
    angle_of_attack: float
    chord_length: float = Field(gt=0)
    velocity: float = Field(gt=0)
    displacement_thickness: float = Field(ge=0)

class FrequencySweepInput(BaseModel):
    start_frequency: float = Field(gt=0)
    end_frequency: float = Field(gt=0)
    num_points: int = Field(default=25, ge=2, le=100)

    angle_of_attack: float
    chord_length: float = Field(gt=0)
    velocity: float = Field(gt=0)
    displacement_thickness: float = Field(ge=0)


# --------------------------------------------------
# Hyperparameter Lab request validation
# --------------------------------------------------

class ExperimentInput(BaseModel):
    algorithm: Literal[
        "Linear Regression",
        "Decision Tree",
        "Random Forest",
        "Gradient Boosting",
        "Support Vector Regression",
    ]

    parameters: dict[str, int | float | str | None] = Field(
        default_factory=dict
    )


ALLOWED_PARAMETERS = {
    "Linear Regression": {},
    "Decision Tree": {
        "max_depth": (1, 30),
        "min_samples_split": (2, 50),
    },
    "Random Forest": {
        "n_estimators": (10, 300),
        "max_depth": (1, 30),
        "min_samples_split": (2, 50),
    },
    "Gradient Boosting": {
        "n_estimators": (10, 300),
        "learning_rate": (0.001, 1.0),
        "max_depth": (1, 10),
    },
    "Support Vector Regression": {
        "C": (0.01, 1000.0),
        "epsilon": (0.001, 10.0),
    },
}


def validate_experiment_parameters(algorithm, parameters):
    allowed = ALLOWED_PARAMETERS[algorithm]

    for name, value in parameters.items():
        if name not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Parameter '{name}' is not allowed for {algorithm}.",
            )

        minimum, maximum = allowed[name]

        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not np.isfinite(value)
            or not minimum <= value <= maximum
        ):
            raise HTTPException(
                status_code=422,
                detail=f"Parameter '{name}' must be between {minimum} and {maximum}.",
            )

        if name in {
            "n_estimators",
            "max_depth",
            "min_samples_split",
        } and not isinstance(value, int):
            raise HTTPException(
                status_code=422,
                detail=f"Parameter '{name}' must be a whole number.",
            )


@app.get("/")
def home():
    return {
        "message": "Welcome to AeroLab AI",
        "status": "running",
        "model": model_name,
    }


@app.post("/predict")
def predict(data: AirfoilInput):
    # Preserve the feature order used during training.
    input_df = pd.DataFrame(
        [[getattr(data, feature) for feature in features]],
        columns=features,
    )

    prediction = model.predict(input_df)[0]

    return {
        "predicted_sound_pressure_db": round(
            float(prediction), 3
        ),
        "model": model_name,
        "units": "dB",
    }
@app.post("/predict/sweep")
def predict_frequency_sweep(data: FrequencySweepInput):
    if data.end_frequency <= data.start_frequency:
        raise HTTPException(
            status_code=422,
            detail="End frequency must be greater than start frequency."
        )

    frequencies = np.linspace(
        data.start_frequency,
        data.end_frequency,
        data.num_points
    )

    sweep_data = pd.DataFrame({
        "frequency": frequencies,
        "angle_of_attack": data.angle_of_attack,
        "chord_length": data.chord_length,
        "velocity": data.velocity,
        "displacement_thickness": data.displacement_thickness
    })

    predictions = model.predict(sweep_data[features])

    return {
        "model": model_name,
        "units": "dB",
        "points": [
            {
                "frequency": round(float(frequency), 2),
                "predicted_sound_pressure_db": round(float(prediction), 3)
            }
            for frequency, prediction in zip(frequencies, predictions)
        ]
    }
    
# --------------------------------------------------
# Model comparison results for the Model Lab
# --------------------------------------------------

RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"


@app.get("/models/comparison")
def get_model_comparison():
    baseline_path = RESULTS_DIR / "model_comparison.json"
    rf_tuning_path = RESULTS_DIR / "random_forest_tuning.json"
    other_tuning_path = RESULTS_DIR / "other_models_tuning.json"

    if not baseline_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Baseline model comparison results not found."
        )

    with baseline_path.open("r", encoding="utf-8") as file:
        baseline = json.load(file)

    tuned = []

    if rf_tuning_path.exists():
        with rf_tuning_path.open("r", encoding="utf-8") as file:
            rf_result = json.load(file)

        tuned.append({
            "model": rf_result["algorithm"],
            "best_params": rf_result["best_params"],
            "cv_mae": rf_result["best_cv_mae"],
            "test_mae": rf_result["test_mae"],
            "test_rmse": rf_result["test_rmse"],
            "test_r2": rf_result["test_r2"],
            "search_seconds": rf_result["search_seconds"]
        })

    if other_tuning_path.exists():
        with other_tuning_path.open("r", encoding="utf-8") as file:
            tuned.extend(json.load(file))

    tuned.sort(key=lambda result: result["cv_mae"])

    return {
        "dataset": "NASA Airfoil Self-Noise",
        "target": "sound_pressure_level",
        "baseline": baseline,
        "tuned": tuned
    }

# --------------------------------------------------
# Interactive Hyperparameter Lab
# --------------------------------------------------
@app.post("/experiments/train")
def train_experiment(data: ExperimentInput):
    validate_experiment_parameters(
        data.algorithm,
        data.parameters,
    )

    if not training_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Another training experiment is already running. Please try again shortly.",
        )

    try:
        result = run_experiment(
            algorithm=data.algorithm,
            params=data.parameters,
        )
        return result

    except (ValueError, TypeError) as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    finally:
        training_lock.release()