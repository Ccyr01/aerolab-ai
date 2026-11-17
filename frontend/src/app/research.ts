import { Component, inject, OnInit, signal, ElementRef, ViewChild, OnDestroy, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API_BASE_URL } from './api-config';
import { Subscription } from 'rxjs';
import { RepeatabilityChart } from './repeatability';
import { FeaturePerformanceChart } from './feature-performance';
import { RunTimeline } from './run-timeline';
import { AcousticFeatureExplorer } from './acoustic-feature-explorer';

interface ActionLiftObservation {
  ObservationID: string;
  DatasetName: string;
  Step: number;
  SequenceType: string;
  CurrentAction: number;
  Delta_Cl: number;
}

interface ResearchRun {
  DatasetName: string;
  SequenceType: string;
}

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [FormsModule, RepeatabilityChart, FeaturePerformanceChart, RunTimeline, AcousticFeatureExplorer],
  templateUrl: './research.html',
  styleUrls: ['./dashboard.scss', './research-overview.scss'],
})
export class ResearchPage implements OnInit, OnDestroy {
  readonly importanceExpanded = signal(false);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  researchLoading = signal(false);
  researchError = signal('');
  researchObservations = signal<ActionLiftObservation[]>([]);
  researchRuns = signal<ResearchRun[]>([]);
  researchRunsLoading = signal(false);
  researchRunsError = signal('');
  selectedResearchRun = '';
  private researchRequest?: Subscription;
  private researchRunsRequest?: Subscription;
  private researchChart?: Chart<'scatter'>;
  private reportedResultsChart?: Chart<'bar'>;
  readonly reportedResults = [
    { features: 'Forcing frequency only', r2: 0.242, mae: 0.0213, rmse: 0.0250 },
    { features: 'Microphone features only', r2: 0.727, mae: 0.0109, rmse: 0.0150 },
    { features: 'Forcing frequency plus correlation-pruned microphone features', r2: 0.745, mae: 0.0106, rmse: 0.0145 },
  ];

  @ViewChild('reportedResultsChart')
  set reportedResultsChartCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.reportedResultsChart?.destroy();
    this.reportedResultsChart = undefined;
    if (!ref) return;

    this.reportedResultsChart = new Chart(ref.nativeElement, {
      type: 'bar',
      data: {
        labels: [
          ['Forcing frequency', 'only'],
          ['Microphone features', 'only'],
          ['Forcing frequency +', 'correlation-pruned', 'microphone features'],
        ],
        datasets: [{
          label: 'Reported cross-validation R²',
          data: this.reportedResults.map((result) => result.r2),
          backgroundColor: ['#557795', '#269fb8', '#31d7e8'],
          borderRadius: 5,
          maxBarThickness: 46,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => this.reportedResults[items[0].dataIndex].features,
              label: (context) => `R²: ${this.reportedResults[context.dataIndex].r2.toFixed(3)}`,
            },
          },
        },
        scales: {
          x: {
            min: 0, max: 1,
            title: { display: true, text: 'Cross-validation R²', color: '#b5ccdc' },
            ticks: { color: '#8ca5b9' },
            grid: { color: '#1b3042' },
          },
          y: {
            ticks: { color: '#b5ccdc', autoSkip: false, font: { size: 12 } },
            grid: { display: false },
          },
        },
      },
    });
  }

  @ViewChild('researchChart')
  set researchChartCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.researchChart?.destroy();
    this.researchChart = undefined;
    if (!ref) return;

    const observations = this.researchObservations();
    this.researchChart = new Chart(ref.nativeElement, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Observed lift change',
          data: observations.map((row) => ({ x: row.CurrentAction, y: row.Delta_Cl })),
          backgroundColor: '#31d7e8',
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#b5ccdc' } },
          tooltip: {
            callbacks: {
              label: (context) => {
                const row = observations[context.dataIndex];
                return `${row.ObservationID}: DBD forcing frequency ${row.CurrentAction} Hz, ΔCL ${row.Delta_Cl.toFixed(4)}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'DBD Forcing Frequency (Hz)', color: '#8ca5b9' },
            ticks: { color: '#8ca5b9' },
            grid: { color: '#1b3042' },
          },
          y: {
            title: { display: true, text: 'Change in Lift Coefficient (ΔCL, dimensionless)', color: '#8ca5b9' },
            ticks: { color: '#8ca5b9' },
            grid: { color: '#1b3042' },
          },
        },
      },
    });
  }

  private loadResearchRuns(): void {
    this.researchRunsLoading.set(true);
    this.researchRunsRequest = this.http.get<ResearchRun[]>(`${this.apiBaseUrl}/research/runs`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (runs) => {
        this.researchRuns.set(runs);
        this.researchRunsLoading.set(false);
      },
      error: () => {
        this.researchRunsError.set('Unable to load experimental runs. The default observations view is still available.');
        this.researchRunsLoading.set(false);
      },
    });
  }

  loadResearchObservations(): void {
    this.researchRequest?.unsubscribe();
    this.researchChart?.destroy();
    this.researchChart = undefined;
    this.researchObservations.set([]);
    this.researchError.set('');
    this.researchLoading.set(true);
    const params: Record<string, string | number> = { limit: 200 };
    const selectedRun = this.selectedResearchRun;
    if (selectedRun) params['DatasetName'] = selectedRun;
    this.researchRequest = this.http.get<ActionLiftObservation[]>(`${this.apiBaseUrl}/research/action-lift`, {
      params,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (rows) => {
        this.researchObservations.set(rows);
        if (selectedRun && rows.length === 0) {
          this.researchError.set(`No observations are available for ${selectedRun}. Select another experimental run or the default multi-run view.`);
        }
        this.researchLoading.set(false);
      },
      error: () => {
        this.researchError.set('Unable to load research observations. Check the API connection and research dataset.');
        this.researchLoading.set(false);
      },
    });
  }


  ngOnInit(): void {
    this.loadResearchObservations();
    this.loadResearchRuns();
  }

  ngOnDestroy(): void {
    this.reportedResultsChart?.destroy();
    this.researchRequest?.unsubscribe();
    this.researchRunsRequest?.unsubscribe();
    this.researchChart?.destroy();
  }
}
