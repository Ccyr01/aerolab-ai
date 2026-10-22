
from pathlib import Path
import time

import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.svm import SVR
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "airfoil_self_noise.dat"

COLUMNS = [
    "frequency",
    "angle_of_attack",
    "chord_length",
    "velocity",
    "displacement_thickness",
    "sound_pressure_level",
]


def load_dataset():
    df = pd.read_csv(
        DATA_PATH,
        sep=r"\s+",
        header=None,
        names=COLUMNS,
    )

    X = df.drop(columns=["sound_pressure_level"])
    y = df["sound_pressure_level"]

    return X, y


def build_model(algorithm, params=None):
    params = params or {}

    if algorithm == "Linear Regression":
        return Pipeline([
            ("scaler", StandardScaler()),
            ("model", LinearRegression()),
        ])

    if algorithm == "Decision Tree":
        return DecisionTreeRegressor(
            random_state=42,
            **params,
        )

    if algorithm == "Random Forest":
        return RandomForestRegressor(
            random_state=42,
            n_jobs=-1,
            **params,
        )

    if algorithm == "Gradient Boosting":
        return GradientBoostingRegressor(
            random_state=42,
            **params,
        )

    if algorithm == "Support Vector Regression":
        return Pipeline([
            ("scaler", StandardScaler()),
            ("model", SVR(**params)),
        ])

    raise ValueError(f"Unsupported algorithm: {algorithm}")


def run_experiment(algorithm, params=None):
    X, y = load_dataset()

    # Keep the final test portion separate.
    X_train_full, X_test, y_train_full, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
    )

    # Use validation data for interactive experiments.
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_full,
        y_train_full,
        test_size=0.25,
        random_state=42,
    )

    model = build_model(algorithm, params)

    start = time.perf_counter()
    model.fit(X_train, y_train)
    training_seconds = time.perf_counter() - start

    predictions = model.predict(X_val)

    mae = mean_absolute_error(y_val, predictions)
    rmse = np.sqrt(mean_squared_error(y_val, predictions))
    r2 = r2_score(y_val, predictions)

    return {
        "algorithm": algorithm,
        "parameters": params or {},
        "dataset": "NASA Airfoil Self-Noise",
        "evaluation_split": "validation",
        "training_samples": len(X_train),
        "validation_samples": len(X_val),
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "r2": round(float(r2), 4),
        "training_seconds": round(training_seconds, 4),
    }


if __name__ == "__main__":
    result = run_experiment(
        "Random Forest",
        {"n_estimators": 100, "max_depth": 10},
    )

    print("\nAEROLAB AI - EXPERIMENT RUNNER")
    print("=" * 50)

    for key, value in result.items():
        print(f"{key}: {value}")
