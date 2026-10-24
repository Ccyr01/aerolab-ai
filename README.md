# AeroLab AI

**An interactive aerospace machine learning platform built with Angular, FastAPI, Python, and scikit-learn.**

[Live Demo](https://happy-ocean-045bd8f1e.6.azurestaticapps.net) | [API Documentation](https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io/docs)

## Overview

AeroLab AI is a full-stack machine learning application designed to make aerospace data exploration, prediction, model comparison, and experimentation more accessible through a web interface.

The current demonstration uses the **NASA Airfoil Self-Noise dataset**, containing 1,503 observations. The application predicts scaled sound pressure level in decibels from five aerodynamic and experimental input variables.

The longer-term goal is to support additional aerospace datasets and research models.

## Features

- **Interactive Predictions:** Estimate airfoil acoustic sound pressure levels using a trained Random Forest model.
- **Frequency Sweep Analysis:** Visualize predicted sound pressure levels across a configurable frequency range.
- **Model Comparison:** Compare baseline and tuned regression models using MAE, RMSE, and R².
- **Hyperparameter Lab:** Train and evaluate machine learning models with configurable hyperparameters.
- **REST API:** Access prediction, frequency analysis, model comparison, and training functionality through FastAPI.
- **Cloud Deployment:** Run the Angular frontend and Dockerized Python backend on Microsoft Azure.

## Machine Learning

The platform supports five regression algorithms:

1. Linear Regression
2. Decision Tree
3. Random Forest
4. Gradient Boosting
5. Support Vector Regression

Model evaluation includes:

| Metric | Description                                            |
| ------ | ------------------------------------------------------ |
| MAE    | Average magnitude of prediction errors                 |
| RMSE   | Root mean squared error, which penalizes larger errors |
| R²     | Goodness of fit relative to predicting the mean        |

The interactive Hyperparameter Lab evaluates training runs on a validation split.

**Important:** The current demonstration predicts acoustic sound pressure level, not aircraft lift.

## Technology Stack

| Layer            | Technologies                           |
| ---------------- | -------------------------------------- |
| Frontend         | Angular, TypeScript, SCSS, Chart.js    |
| Backend          | Python, FastAPI, Pydantic, Uvicorn     |
| Machine Learning | scikit-learn, pandas, NumPy, joblib    |
| Containers       | Docker                                 |
| Frontend Hosting | Azure Static Web Apps                  |
| Backend Hosting  | Azure Container Apps                   |
| Source Control   | Git, GitHub                            |
| Deployment       | GitHub Actions for frontend deployment |

## Architecture

```text
                  User's Browser
                        |
                        v
              Angular Dashboard
              Azure Static Web Apps
                        |
                   HTTPS / JSON
                        |
                        v
                 FastAPI REST API
               Azure Container Apps
                        |
              +---------+---------+
              |                   |
              v                   v
        Saved ML Model       Experiment Runner
        Predictions          scikit-learn Training
              |                   |
              +---------+---------+
                        |
                        v
              NASA Demonstration Data
              and Evaluation Results
```

## API Endpoints

| Method | Endpoint             | Purpose                                       |
| ------ | -------------------- | --------------------------------------------- |
| GET    | `/`                  | API status and model information              |
| POST   | `/predict`           | Predict sound pressure level                  |
| POST   | `/predict/sweep`     | Generate predictions across a frequency range |
| GET    | `/models/comparison` | Retrieve model evaluation results             |
| POST   | `/experiments/train` | Train and evaluate a model                    |

Interactive documentation is available through the [FastAPI Swagger interface](https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io/docs).

## Running Locally

### Backend

Create a Python 3.11 virtual environment, install the dependencies, and start FastAPI:

```bash
python -m venv .venv
```

On Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

API documentation: `http://127.0.0.1:8000/docs`

### Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm start
```

Dashboard: `http://localhost:4200`

### Docker Backend

From the project root:

```bash
docker build -t aerolab-backend .
docker run --rm -p 8000:8000 aerolab-backend
```

## Project Links

**[Live AeroLab AI Application](https://happy-ocean-045bd8f1e.6.azurestaticapps.net)**

**[Backend API Documentation](https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io/docs)**

---

Developed as an aerospace machine learning and data mining project, with an emphasis on interactive experimentation, full-stack development, and cloud deployment.
