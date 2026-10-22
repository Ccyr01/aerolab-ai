
from pathlib import Path
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)

# 1. Load the NASA airfoil dataset
columns = [
    "frequency",
    "angle_of_attack",
    "chord_length",
    "velocity",
    "displacement_thickness",
    "sound_pressure_level",
]

df = pd.read_csv(
    "data/airfoil_self_noise.dat",
    sep=r"\s+",
    header=None,
    names=columns,
)

# 2. Separate features and target
feature_columns = columns[:-1]

X = df[feature_columns]
y = df["sound_pressure_level"]

# 3. Split data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
)

# 4. Define our models
models = {
    "Linear Regression": LinearRegression(),
    "Random Forest": RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        n_jobs=-1,
    ),
}

# 5. Train and evaluate each model
results = {}

for name, model in models.items():
    print(f"\nTraining {name}...")

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    mae = mean_absolute_error(y_test, predictions)
    rmse = mean_squared_error(
        y_test, predictions
    ) ** 0.5
    r2 = r2_score(y_test, predictions)

    results[name] = {
        "model": model,
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
    }

    print(f"MAE:  {mae:.4f} dB")
    print(f"RMSE: {rmse:.4f} dB")
    print(f"R²:   {r2:.4f}")

# 6. Select the model with the lowest test RMSE
best_name = min(
    results,
    key=lambda name: results[name]["rmse"]
)

best_model = results[best_name]["model"]

# 7. Save the model and feature names
model_dir = Path("backend/models")
model_dir.mkdir(parents=True, exist_ok=True)

joblib.dump(
    {
        "model": best_model,
        "features": feature_columns,
        "model_name": best_name,
    },
    model_dir / "airfoil_model.joblib",
)

print("\n----------------------------")
print(f"Best model: {best_name}")
print("Saved to backend/models/airfoil_model.joblib")
print("----------------------------")
