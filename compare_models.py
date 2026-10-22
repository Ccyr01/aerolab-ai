
from pathlib import Path
import json
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


# Project paths
ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "airfoil_self_noise.dat"
RESULTS_DIR = ROOT / "results"
RESULTS_DIR.mkdir(exist_ok=True)

# NASA airfoil dataset columns
columns = [
    "frequency",
    "angle_of_attack",
    "chord_length",
    "velocity",
    "displacement_thickness",
    "sound_pressure_level"
]

# Load dataset
df = pd.read_csv(DATA_PATH, sep=r"\s+", header=None, names=columns)

X = df.drop(columns=["sound_pressure_level"])
y = df["sound_pressure_level"]

# Same split for every model
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# Models to compare
models = {
    "Linear Regression": Pipeline([
        ("scaler", StandardScaler()),
        ("model", LinearRegression())
    ]),

    "Decision Tree": DecisionTreeRegressor(
        random_state=42
    ),

    "Random Forest": RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        n_jobs=-1
    ),

    "Gradient Boosting": GradientBoostingRegressor(
        random_state=42
    ),

    "Support Vector Regression": Pipeline([
        ("scaler", StandardScaler()),
        ("model", SVR(kernel="rbf"))
    ])
}

results = []

print("\nAEROLAB AI - MODEL COMPARISON")
print("=" * 65)

for name, model in models.items():
    print(f"\nTraining: {name}")

    start = time.perf_counter()
    model.fit(X_train, y_train)
    training_time = time.perf_counter() - start

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = np.sqrt(mean_squared_error(y_test, predictions))
    r2 = r2_score(y_test, predictions)

    results.append({
        "model": name,
        "mae": round(float(mae), 4),
        "rmse": round(float(rmse), 4),
        "r2": round(float(r2), 4),
        "training_seconds": round(training_time, 4)
    })

    print(f"  MAE:  {mae:.4f}")
    print(f"  RMSE: {rmse:.4f}")
    print(f"  R2:   {r2:.4f}")
    print(f"  Time: {training_time:.4f} seconds")

# Sort by lowest MAE
results.sort(key=lambda item: item["mae"])

# Save JSON for our future FastAPI endpoint
output_path = RESULTS_DIR / "model_comparison.json"

with open(output_path, "w", encoding="utf-8") as file:
    json.dump(results, file, indent=2)

# Save CSV for data mining reports
pd.DataFrame(results).to_csv(
    RESULTS_DIR / "model_comparison.csv",
    index=False
)

print("\n" + "=" * 65)
print("MODEL LEADERBOARD")
print("=" * 65)

for rank, result in enumerate(results, start=1):
    print(
        f"{rank}. {result['model']:<28} "
        f"MAE={result['mae']:.4f} "
        f"R2={result['r2']:.4f}"
    )

print(f"\nResults saved to: {RESULTS_DIR}")
