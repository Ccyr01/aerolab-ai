FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY data/airfoil_self_noise.dat ./data/airfoil_self_noise.dat
COPY data/research/observations.csv data/research/repeatability_by_step.csv data/research/supervised_summary.csv data/research/dataset_info.json ./data/research/
COPY data/research/acoustic_rms.csv ./data/research/acoustic_rms.csv
COPY demo_results/ ./results/
COPY experiment_runner.py ./experiment_runner.py

EXPOSE 8000

ENV ENABLE_TRAINING=false

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
