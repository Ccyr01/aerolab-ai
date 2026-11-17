import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Data } from 'plotly.js';
import { API_BASE_URL } from './api-config';

export interface SupervisedResult {
  target: 'CL' | 'R';
  model: 'Ridge' | 'RandomForest';
  representation: 'Action' | 'Microphones' | 'Action + Microphones';
  subset: string;
  n_features: number;
  R2_mean: number;
  R2_std: number;
  MAE_mean: number;
  MAE_std: number;
  RMSE_mean: number;
  RMSE_std: number;
}

@Component({
  selector: 'app-feature-performance',
  imports: [FormsModule],
  template: `
    <section aria-labelledby="feature-performance-title" [attr.aria-busy]="loading()">
      <h2 id="feature-performance-title">Model Performance vs. Feature Count</h2>
      <p>Compare Ridge Regression and Random Forest using five-fold cross-validation grouped by experimental run. Feature pruning and ranking use training data only.</p>
      <div class="controls">
        <div><label for="performance-target">Aerodynamic target</label>
          <select id="performance-target" [(ngModel)]="target" (ngModelChange)="render()" [disabled]="loading() || !!error()">
            <option value="CL">CL — Lift coefficient</option><option value="R">R — Baseline-relative response</option>
          </select></div>
        <div><label for="performance-predictors">Predictors</label>
          <select id="performance-predictors" [(ngModel)]="representation" (ngModelChange)="render()" [disabled]="loading() || !!error()">
            <option value="Microphones">Microphones only</option><option value="Action + Microphones">Action + Microphones</option>
          </select></div>
      </div>
      @if (loading()) { <p role="status">Loading verified model results...</p> }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <figure>
        <div class="plot-viewport" tabindex="0" role="region" aria-label="Model performance chart; scroll horizontally on narrow screens">
          <div #plot role="img" aria-describedby="performance-caption" [attr.aria-label]="'Five-fold mean R² with sample SD error bars for Ridge Regression and Random Forest; target ' + target + '; predictors ' + representation"></div>
        </div>
        <figcaption id="performance-caption">
          <p>Error bars: ±1 sample SD across five held-out folds, not confidence intervals. Hover for mean ± SD of R², MAE, RMSE, and microphone feature count.</p>
          <p>“All” is the full training-fold correlation-pruned representation, not the original 244 features. {{ retainedSummary() }} The x-axis shows ordered subsets with equal spacing. Action adds one predictor beyond the microphone count.</p>
          <p class="tradeoff">30-feature tradeoff: compare compactness with the observed performance at 50 and All retained. Similar scores or overlapping error bars do not establish equivalence.</p>
        </figcaption>
      </figure>
    </section>`,
  styles: [`
    :host { display: block; min-width: 0; margin: 32px; }
    section { padding: clamp(20px, 3vw, 36px); background: #0d1b2a; border: 1px solid #254056; border-radius: 20px; color: #c4d8e8; }
    h2 { margin: 0 0 16px; color: #e7f4fc; font-size: clamp(24px, 2.5vw, 32px); line-height: 1.25; }
    p { margin: 0; font-size: 16px; line-height: 1.7; }
    .controls { display: flex; flex-wrap: wrap; gap: 20px 28px; margin: 28px 0 16px; }
    .controls > div { display: grid; gap: 10px; min-width: 0; }
    label { color: #e7f4fc; font-weight: 600; }
    select { box-sizing: border-box; min-height: 48px; max-width: 100%; padding: 10px 14px; border: 1px solid #357088; border-radius: 8px; background: #142a3b; color: #e7f4fc; font: inherit; font-size: 16px; }
    select:focus-visible { outline: 2px solid #31d7e8; outline-offset: 4px; }
    figure { margin: 0; min-width: 0; }
    .plot-viewport { overflow-x: auto; }
    .plot-viewport:focus-visible { outline: 2px solid #31d7e8; outline-offset: 4px; }
    [role=img] { height: 620px; width: 100%; min-width: 500px; }
    figcaption { border-top: 1px solid #254056; padding-top: 20px; }
    figcaption p { font-size: 15px; }
    figcaption p + p { margin-top: 12px; }
    .tradeoff { border-left: 3px solid #31d7e8; padding-left: 16px; }
    @media (max-width: 700px) {
      :host { margin: 20px 16px; }
      section { padding: 20px 12px; }
      .controls { flex-direction: column; }
      [role=img] { height: 500px; }
    }
  `],
})
export class FeaturePerformanceChart implements AfterViewInit, OnDestroy {
  @ViewChild('plot', { static: true }) plot!: ElementRef<HTMLDivElement>;
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);
  private plotly?: typeof import('plotly.js');
  private observer?: ResizeObserver;
  private destroyed = false;
  private rows: SupervisedResult[] = [];
  readonly subsets = ['5', '10', '20', '30', '50', 'All'];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly retainedSummary = signal('');
  target: 'CL' | 'R' = 'CL';
  representation: 'Microphones' | 'Action + Microphones' = 'Microphones';

  async ngAfterViewInit(): Promise<void> {
    try {
      this.plotly = (await import('plotly.js-basic-dist-min')).default;
      if (this.destroyed) return;
      this.observer = new ResizeObserver(() => { void this.plotly?.Plots.resize(this.plot.nativeElement); });
      this.http.get<SupervisedResult[]>(`${this.api}/research/supervised`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: rows => { this.rows = rows; this.loading.set(false); this.render(); },
        error: () => { this.loading.set(false); this.error.set('Unable to load model performance results. Check the research API connection.'); },
      });
    } catch {
      this.loading.set(false);
      this.error.set('Unable to load the interactive model performance chart. Reload to retry.');
    }
  }

  render(): void {
    if (!this.plotly || this.destroyed) return;
    const traces: Data[] = [];
    const retained: string[] = [];
    let tradeoffY = 0;
    const lowerBounds: number[] = [];
    const upperBounds: number[] = [];
    for (const model of ['Ridge', 'RandomForest'] as const) {
      const records = this.subsets.map(subset => this.rows.find(row => row.target === this.target && row.representation === this.representation && row.model === model && row.subset === subset));
      if (records.some(row => !row)) { this.error.set('The model performance summary is incomplete.'); return; }
      const rows = records as SupervisedResult[];
      lowerBounds.push(...rows.map(row => row.R2_mean - row.R2_std));
      upperBounds.push(...rows.map(row => row.R2_mean + row.R2_std));
      const name = model === 'Ridge' ? 'Ridge Regression' : 'Random Forest';
      if (model === 'RandomForest') tradeoffY = rows[this.subsets.indexOf('30')].R2_mean;
      retained.push(`${name}: ${rows[5].n_features.toFixed(1)} microphone features on average across folds.`);
      traces.push({
        type: 'scatter', mode: 'lines+markers', name,
        x: this.subsets, y: rows.map(row => row.R2_mean),
        line: { color: model === 'Ridge' ? '#4de3f3' : '#ffbf69', width: 3, dash: model === 'Ridge' ? 'solid' : 'dash' },
        marker: { size: 10, symbol: model === 'Ridge' ? 'circle' : 'diamond' },
        error_y: { type: 'data', array: rows.map(row => row.R2_std), visible: true, thickness: 2, width: 6 },
        customdata: rows.map(row => [name, row.n_features, row.R2_std, row.MAE_mean, row.MAE_std, row.RMSE_mean, row.RMSE_std, this.target, this.representation]),
        hovertemplate: 'Model: %{customdata[0]}<br>Target: %{customdata[7]}<br>Predictors: %{customdata[8]}<br>Subset: %{x}<br>Microphone count (fold mean): %{customdata[1]:.1f}<br>R²: %{y:.4f} ± %{customdata[2]:.4f}<br>MAE: %{customdata[3]:.5f} ± %{customdata[4]:.5f}<br>RMSE: %{customdata[5]:.5f} ± %{customdata[6]:.5f}<br>Uncertainty: sample SD across 5 folds<extra></extra>',
      });
    }
    this.retainedSummary.set(retained.join(' '));
    // Reserve visual headroom for the callout above the RF point and its error bar.
    const upper = Math.max(...upperBounds);
    const calloutHeadroom = Math.max(0.1, upper - Math.min(...lowerBounds)) * 0.4;
    void this.plotly.react(this.plot.nativeElement, traces, {
      autosize: true, paper_bgcolor: '#0d1b2a', plot_bgcolor: '#0d1b2a', font: { color: '#e0edf7', size: 18 },
      margin: { l: 85, r: 35, t: 115, b: 95 },
      legend: { orientation: 'h', x: 0, y: 1.14, yanchor: 'bottom', font: { size: 17 }, itemsizing: 'constant', tracegroupgap: 16 }, hoverlabel: { font: { size: 16 } },
      xaxis: { type: 'category', categoryorder: 'array', categoryarray: this.subsets, range: [-0.4, 5.4], tickmode: 'array', tickvals: this.subsets, ticktext: this.subsets, tickangle: 0, tickfont: { size: 17 }, title: { text: 'Microphone feature subset', font: { size: 18 }, standoff: 24 }, automargin: true, gridcolor: '#254056' },
      yaxis: { title: { text: 'Mean five-fold R²', font: { size: 18 }, standoff: 20 }, tickfont: { size: 16 }, automargin: true, autorangeoptions: { include: upper + calloutHeadroom }, gridcolor: '#254056', zerolinecolor: '#829fb5' },
      annotations: [{ xref: 'x', x: '30', yref: 'y', y: tradeoffY, ax: -45, ay: -75, text: '30-feature tradeoff<br>Random Forest', showarrow: true, arrowhead: 2, arrowsize: 1, arrowwidth: 1.5, arrowcolor: '#ffbf69', standoff: 8, bgcolor: '#142a3b', bordercolor: '#ffbf69', borderpad: 8, font: { size: 15, color: '#e0edf7' } }],
    }, { responsive: true, displaylogo: false }).then(() => {
      if (!this.destroyed) this.observer?.observe(this.plot.nativeElement);
    }).catch(() => this.error.set('Unable to display model performance results.'));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.plotly?.purge(this.plot.nativeElement);
  }
}
