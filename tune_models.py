
from pathlib import Path
import json
import time

import numpy as np
import pandas as pd

from sklearn.model_selection import (
    train_test_split,
    KFold,
    RandomizedSearchCV
)
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "airfoil_self_noise.dat"
RESULTS_DIR = ROOT / "results"
RESULTS_DIR.mkdir(exist_ok=True)

columns = [
    "frequency",
    "angle_of_attack",
    "chord_length",
    "velocity",
    "displacement_thickness",
    "sound_pressure_level"
]

df = pd.read_csv(
    DATA_PATH,
    sep=r"\s+",
    header=None,
    names=columns
)

X = df.drop(columns=["sound_pressure_level"])
y = df["sound_pressure_level"]

# Reproduce the split used in Step 10.
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

model = RandomForestRegressor(
    random_state=42,
    n_jobs=1
)

# Hyperparameters to explore
parameter_distributions = {
    "n_estimators": [100, 200, 300],
    "max_depth": [None, 10, 20, 30],
    "min_samples_split": [2, 5, 10],
    "min_samples_leaf": [1, 2, 4]
}

cv = KFold(
    n_splits=5,
    shuffle=True,
    random_state=42
)

search = RandomizedSearchCV(
    estimator=model,
    param_distributions=parameter_distributions,
    n_iter=12,
    scoring="neg_mean_absolute_error",
    cv=cv,
    random_state=42,
    n_jobs=-1,
    verbose=1,
    refit=True
)

print("\nAEROLAB AI — RANDOM FOREST HYPERPARAMETER TUNING")
print("=" * 65)

start = time.perf_counter()
search.fit(X_train, y_train)
elapsed = time.perf_counter() - start

print("\nBEST HYPERPARAMETERS")
print(search.best_params_)

print(
    f"\nBest cross-validation MAE: {-search.best_score_:.4f}"
)

# Evaluate the selected model on the held-out test set.
predictions = search.best_estimator_.predict(X_test)

test_mae = mean_absolute_error(y_test, predictions)
test_rmse = np.sqrt(mean_squared_error(y_test, predictions))
test_r2 = r2_score(y_test, predictions)

print("\nFINAL TEST RESULTS")
print(f"MAE:  {test_mae:.4f}")
print(f"RMSE: {test_rmse:.4f}")
print(f"R²:   {test_r2:.4f}")
print(f"Search time: {elapsed:.2f} seconds")

# Save search results for later analysis.
cv_results = pd.DataFrame(search.cv_results_)

cv_results.to_csv(
    RESULTS_DIR / "random_forest_tuning_trials.csv",
    index=False
)

summary = {
    "algorithm": "Random Forest",
    "best_params": search.best_params_,
    "best_cv_mae": round(float(-search.best_score_), 4),
    "test_mae": round(float(test_mae), 4),
    "test_rmse": round(float(test_rmse), 4),
    "test_r2": round(float(test_r2), 4),
    "search_seconds": round(elapsed, 2)
}

with open(
    RESULTS_DIR / "random_forest_tuning.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(summary, file, indent=2)

print("\nTuning results saved in the results folder.")
