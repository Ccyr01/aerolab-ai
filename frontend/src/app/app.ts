import { Component, inject, OnInit, signal, ElementRef, ViewChild, OnDestroy, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';

interface PredictionResponse {
  predicted_sound_pressure_db: number;
  model: string;
  units: string;
}

interface BaselineModel {
  model: string;
  mae: number;
  rmse: number;
  r2: number;
  training_seconds: number;
}

interface TunedModel {
  model: string;
  best_params: Record<string, unknown>;
  cv_mae: number;
  test_mae: number;
  test_rmse: number;
  test_r2: number;
  search_seconds: number;
}

interface ExperimentResult {
  algorithm: string;
  parameters: Record<string, number>;
  dataset: string;
  evaluation_split: string;
  training_samples: number;
  validation_samples: number;
  mae: number;
  rmse: number;
  r2: number;
  training_seconds: number;
}

interface ModelComparisonResponse {
  dataset: string;
  target: string;
  baseline: BaselineModel[];
  tuned: TunedModel[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private readonly apiBaseUrl = isDevMode()
  ? 'http://127.0.0.1:8000'
  : 'https://aerolab-api.lemonsmoke-03aa9e66.westus2.azurecontainerapps.io';
  private http = inject(HttpClient);

  // Interactive Hyperparameter Lab
  selectedAlgorithm = 'Random Forest';

  experimentParameters = {
    n_estimators: 100,
    max_depth: 10,
    min_samples_split: 2,
    learning_rate: 0.1,
    C: 1.0,
    epsilon: 0.1,
  };

  experimentResult: ExperimentResult | null = null;
  experimentLoading = false;
  experimentError = '';

  comparisonData: ModelComparisonResponse | null = null;
  comparisonLoading = false;
  comparisonError = '';

  // Initial values from our earlier successful API test
  frequency = 800;
  angleOfAttack = 0;
  chordLength = 0.3048;
  velocity = 71.3;
  displacementThickness = 0.00266337;

  // Reactive state for the prediction panel
  prediction = signal<number | null>(null);
  loading = signal(false);
  error = signal('');
  modelName = signal('');

  predict(): void {
    this.loading.set(true);
    this.error.set('');
    this.prediction.set(null);

    const input = {
      frequency: this.frequency,
      angle_of_attack: this.angleOfAttack,
      chord_length: this.chordLength,
      velocity: this.velocity,
      displacement_thickness: this.displacementThickness,
    };

    this.http.post<PredictionResponse>(`${this.apiBaseUrl}/predict`, input).subscribe({
      next: (response) => {
        this.prediction.set(response.predicted_sound_pressure_db);
        this.modelName.set(response.model);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(
          'Prediction failed. Check that the FastAPI server is running and your inputs are valid.',
        );
        this.loading.set(false);
      },
    });
  }

  @ViewChild('frequencyChart')
  frequencyChartRef?: ElementRef<HTMLCanvasElement>;

  private frequencyChart?: Chart<'line'>;

  @ViewChild('comparisonChart')
  set comparisonChartCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.comparisonChartRef = ref;

    if (ref && this.comparisonData) {
      this.renderComparisonChart();
    }
  }

  comparisonChartRef?: ElementRef<HTMLCanvasElement>;

  private comparisonChart?: Chart<'bar'>;

  sweepStart = 200;
  sweepEnd = 2000;
  sweepPoints = 10;

  sweepLoading = signal(false);
  sweepError = signal('');

  generateSweep(): void {
    if (
      !Number.isFinite(this.sweepStart) ||
      !Number.isFinite(this.sweepEnd) ||
      !Number.isInteger(this.sweepPoints) ||
      this.sweepStart <= 0 ||
      this.sweepEnd <= this.sweepStart ||
      this.sweepPoints < 2 ||
      this.sweepPoints > 100
    ) {
      this.sweepError.set(
        'Enter a valid frequency range and a whole number of points between 2 and 100.',
      );
      return;
    }

    this.sweepLoading.set(true);
    this.sweepError.set('');

    const input = {
      start_frequency: this.sweepStart,
      end_frequency: this.sweepEnd,
      num_points: this.sweepPoints,
      angle_of_attack: this.angleOfAttack,
      chord_length: this.chordLength,
      velocity: this.velocity,
      displacement_thickness: this.displacementThickness,
    };

    this.http
      .post<{
        model: string;
        units: string;
        points: {
          frequency: number;
          predicted_sound_pressure_db: number;
        }[];
      }>(`${this.apiBaseUrl}/predict/sweep`, input)
      .subscribe({
        next: (response) => {
          this.renderFrequencyChart(response.points);
          this.sweepLoading.set(false);
        },
        error: () => {
          this.sweepError.set(
            'Frequency sweep failed. Check that FastAPI is running and your inputs are valid.',
          );
          this.sweepLoading.set(false);
        },
      });
  }

  private renderFrequencyChart(
    points: {
      frequency: number;
      predicted_sound_pressure_db: number;
    }[],
  ): void {
    const canvas = this.frequencyChartRef?.nativeElement;

    if (!canvas) {
      this.sweepError.set('Chart canvas not found.');
      return;
    }

    this.frequencyChart?.destroy();

    this.frequencyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map((point) => point.frequency),
        datasets: [
          {
            label: 'Predicted Sound Pressure (dB)',
            data: points.map((point) => point.predicted_sound_pressure_db),
            borderColor: '#4bd5ed',
            backgroundColor: 'rgba(75, 213, 237, 0.12)',
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 7,
            tension: 0.25,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            labels: {
              color: '#b5ccdc',
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y?.toFixed(3) ?? '—'} dB`,
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Acoustic Frequency (Hz)',
              color: '#8ca5b9',
            },
            ticks: {
              color: '#8ca5b9',
              maxTicksLimit: 10,
            },
            grid: {
              color: '#1b3042',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Predicted Sound Pressure (dB)',
              color: '#8ca5b9',
            },
            ticks: {
              color: '#8ca5b9',
            },
            grid: {
              color: '#1b3042',
            },
          },
        },
      },
    });
  }

  runExperiment(): void {
    this.experimentLoading = true;
    this.experimentError = '';
    this.experimentResult = null;

    let parameters: Record<string, number> = {};

    switch (this.selectedAlgorithm) {
      case 'Random Forest':
        parameters = {
          n_estimators: this.experimentParameters.n_estimators,
          max_depth: this.experimentParameters.max_depth,
          min_samples_split: this.experimentParameters.min_samples_split,
        };
        break;

      case 'Decision Tree':
        parameters = {
          max_depth: this.experimentParameters.max_depth,
          min_samples_split: this.experimentParameters.min_samples_split,
        };
        break;

      case 'Gradient Boosting':
        parameters = {
          n_estimators: this.experimentParameters.n_estimators,
          learning_rate: this.experimentParameters.learning_rate,
          max_depth: this.experimentParameters.max_depth,
        };
        break;

      case 'Support Vector Regression':
        parameters = {
          C: this.experimentParameters.C,
          epsilon: this.experimentParameters.epsilon,
        };
        break;

      case 'Linear Regression':
        parameters = {};
        break;
    }

    this.http
      .post<ExperimentResult>(`${this.apiBaseUrl}/experiments/train`, {
        algorithm: this.selectedAlgorithm,
        parameters,
      })
      .subscribe({
        next: (result) => {
          this.experimentResult = result;
          this.experimentLoading = false;
        },
        error: (error) => {
          this.experimentError =
            error.error?.detail || 'Training failed. Check the backend and parameter values.';
          this.experimentLoading = false;
        },
      });
  }

  ngOnInit(): void {
    this.loadModelComparison();
  }

  loadModelComparison(): void {
    this.comparisonLoading = true;
    this.comparisonError = '';

    this.http.get<ModelComparisonResponse>(`${this.apiBaseUrl}/models/comparison`).subscribe({
      next: (data) => {
        this.comparisonData = data;
        this.comparisonLoading = false;
        console.log('Model comparison loaded:', data);

        this.renderComparisonChart();
      },
      error: (error) => {
        this.comparisonError = 'Unable to load model comparison results.';
        this.comparisonLoading = false;
        console.error('Model comparison error:', error);
      },
    });
  }

  private renderComparisonChart(): void {
    const canvas = this.comparisonChartRef?.nativeElement;
    const comparison = this.comparisonData;

    if (!canvas || !comparison) {
      return;
    }

    // Only compare algorithms that have both results.
    const matchedModels = comparison.tuned
      .map((tuned) => ({
        tuned,
        baseline: comparison.baseline.find((baseline) => baseline.model === tuned.model),
      }))
      .filter(
        (
          entry,
        ): entry is {
          tuned: TunedModel;
          baseline: BaselineModel;
        } => entry.baseline !== undefined,
      );

    this.comparisonChart?.destroy();

    this.comparisonChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: matchedModels.map((entry) => entry.tuned.model),
        datasets: [
          {
            label: 'Baseline Test MAE',
            data: matchedModels.map((entry) => entry.baseline.mae),
            backgroundColor: '#557795',
            borderRadius: 5,
          },
          {
            label: 'Tuned Test MAE',
            data: matchedModels.map((entry) => entry.tuned.test_mae),
            backgroundColor: '#31d7e8',
            borderRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#b5ccdc',
            },
          },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${context.parsed.y?.toFixed(4) ?? '—'} dB`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#8ca5b9',
            },
            grid: {
              display: false,
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Mean Absolute Error (dB)',
              color: '#8ca5b9',
            },
            ticks: {
              color: '#8ca5b9',
            },
            grid: {
              color: '#1b3042',
            },
          },
        },
      },
    });
  }

  getBaselineModel(modelName: string): BaselineModel | undefined {
    return this.comparisonData?.baseline.find((model) => model.model === modelName);
  }
  ngOnDestroy(): void {
    this.frequencyChart?.destroy();
    this.comparisonChart?.destroy();
  }
}
