
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
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.svm import SVR
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)


# --------------------------------------------------
# 1. Load the NASA airfoil dataset
# --------------------------------------------------

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

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

cv = KFold(
    n_splits=5,
    shuffle=True,
    random_state=42
)


# --------------------------------------------------
# 2. Define algorithms and hyperparameter searches
# --------------------------------------------------

experiments = {
    "Decision Tree": {
        "estimator": DecisionTreeRegressor(
            random_state=42
        ),
        "params": {
            "max_depth": [None, 5, 10, 20, 30],
            "min_samples_split": [2, 5, 10],
            "min_samples_leaf": [1, 2, 4]
        }
    },

    "Gradient Boosting": {
        "estimator": GradientBoostingRegressor(
            random_state=42
        ),
        "params": {
            "n_estimators": [100, 200, 300],
            "learning_rate": [0.03, 0.05, 0.1, 0.2],
            "max_depth": [2, 3, 4]
        }
    },

    "Support Vector Regression": {
        "estimator": Pipeline([
            ("scaler", StandardScaler()),
            ("model", SVR())
        ]),
        "params": {
            "model__C": [1, 10, 100, 1000],
            "model__epsilon": [0.01, 0.1, 0.5],
            "model__gamma": ["scale", 0.01, 0.1, 1],
            "model__kernel": ["rbf"]
        }
    },

    "Ridge Regression": {
        "estimator": Pipeline([
            ("scaler", StandardScaler()),
            ("model", Ridge())
        ]),
        "params": {
            "model__alpha": [
                0.001, 0.01, 0.1, 1, 10, 100, 1000
            ]
        }
    }
}


# --------------------------------------------------
# 3. Tune each algorithm
# --------------------------------------------------

all_results = []

print("\nAEROLAB AI — MULTI-MODEL HYPERPARAMETER TUNING")
print("=" * 65)

for name, config in experiments.items():
    print(f"\nTuning: {name}")
    print("-" * 65)

    search = RandomizedSearchCV(
        estimator=config["estimator"],
        param_distributions=config["params"],
        n_iter=12,
        scoring="neg_mean_absolute_error",
        cv=cv,
        random_state=42,
        n_jobs=-1,
        verbose=1,
        refit=True
    )

    start = time.perf_counter()
    search.fit(X_train, y_train)
    elapsed = time.perf_counter() - start

    predictions = search.best_estimator_.predict(X_test)

    test_mae = mean_absolute_error(y_test, predictions)
    test_rmse = np.sqrt(
        mean_squared_error(y_test, predictions)
    )
    test_r2 = r2_score(y_test, predictions)

    result = {
        "model": name,
        "best_params": search.best_params_,
        "cv_mae": round(float(-search.best_score_), 4),
        "test_mae": round(float(test_mae), 4),
        "test_rmse": round(float(test_rmse), 4),
        "test_r2": round(float(test_r2), 4),
        "search_seconds": round(elapsed, 2)
    }

    all_results.append(result)

    # Save detailed cross-validation trials
    filename = name.lower().replace(" ", "_")

    pd.DataFrame(search.cv_results_).to_csv(
        RESULTS_DIR / f"{filename}_tuning_trials.csv",
        index=False
    )

    print(f"\nBest parameters: {search.best_params_}")
    print(f"Best CV MAE:     {-search.best_score_:.4f}")
    print(f"Test MAE:        {test_mae:.4f}")
    print(f"Test RMSE:       {test_rmse:.4f}")
    print(f"Test R²:         {test_r2:.4f}")
    print(f"Search time:     {elapsed:.2f} seconds")


# --------------------------------------------------
# 4. Save model comparison results
# --------------------------------------------------

all_results.sort(key=lambda item: item["cv_mae"])

with open(
    RESULTS_DIR / "other_models_tuning.json",
    "w",
    encoding="utf-8"
) as file:
    json.dump(all_results, file, indent=2)

pd.DataFrame(all_results).to_csv(
    RESULTS_DIR / "other_models_tuning.csv",
    index=False
)

print("\n" + "=" * 65)
print("TUNED MODEL LEADERBOARD — SORTED BY CV MAE")
print("=" * 65)

for rank, result in enumerate(all_results, start=1):
    print(
        f"{rank}. {result['model']:<28} "
        f"CV MAE={result['cv_mae']:.4f} "
        f"Test MAE={result['test_mae']:.4f} "
        f"R²={result['test_r2']:.4f}"
    )

print(f"\nResults saved to: {RESULTS_DIR}")
