import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import Chart from 'chart.js/auto';
import { API_BASE_URL } from './api-config';

interface AcousticPoint {
  ObservationID: string; SignalIndex: number; DatasetName: string; SequenceType: string; Step: number;
  values: Record<string, number>;
}

@Component({
  selector: 'app-acoustic-feature-explorer',
  imports: [FormsModule],
  template: `
    <section aria-labelledby="acoustic-title" [attr.aria-busy]="loading()">
      <h2 id="acoustic-title">Microphone Intelligence</h2>
      <h3>Acoustic Feature Explorer</h3>
      <p>Explore existing engineered RMS amplitude summaries for Mic3 through Mic10 in experimental acquisition order. These values are not raw waveforms, full spectra, or model-importance scores.</p>
      <div class="controls">
        <div><label for="acoustic-run">Experimental run</label>
          <select id="acoustic-run" [(ngModel)]="selectedRun" (ngModelChange)="load()" [disabled]="runsLoading()">
            <option value="">Select an experimental run</option>
            @for (run of runs(); track run.DatasetName) { <option [value]="run.DatasetName">{{ run.DatasetName }} - {{ run.SequenceType }}</option> }
          </select>
        </div>
        <div><label for="acoustic-feature">Engineered feature</label>
          <select id="acoustic-feature" [(ngModel)]="feature" (ngModelChange)="load()">
            <option value="rms">RMS amplitude</option>
          </select>
        </div>
      </div>
      <fieldset><legend>Microphone channels (IDs, not spatial positions)</legend>
        @for (mic of microphones; track mic; let i = $index) {
          <label class="channel"><input type="checkbox" [checked]="selected.has(mic)" (change)="toggle(mic)" />
            <span class="swatch" [style.background]="colors[i]" aria-hidden="true"></span>{{ mic }}</label>
        }
      </fieldset>
      @if (loading() || runsLoading()) { <p role="status">Loading acoustic feature data...</p> }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (!selectedRun) { <p role="status">Select an experimental run to explore its microphone features.</p> }
      @if (selected.size === 0) { <p role="status">Select at least one microphone channel to display values.</p> }
      <figure>
        <div class="chart"><canvas #canvas role="img" [attr.aria-label]="'Engineered RMS amplitude by experimental step for ' + (selectedRun || 'no selected run') + '; channels: ' + selectedChannels.join(', ')"></canvas></div>
        <figcaption>RMS values are shown as exported, without normalization or averaging. Physical amplitude units and cross-channel calibration are undocumented. Channel magnitude does not establish predictive importance. Only RMS is offered; spectral-band extraction definitions are not verified locally.</figcaption>
      </figure>
      @if (rows().length && selected.size) {
        <details><summary>View exact feature values</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Acoustic feature values; scroll horizontally if needed">
          <table><caption>{{ selectedRun }} - RMS amplitude, exported units (physical units undocumented)</caption>
            <thead><tr><th scope="col">Step</th><th scope="col">Observation</th>@for (mic of selectedChannels; track mic) { <th scope="col">{{ mic }}_rms</th> }</tr></thead>
            <tbody>@for (row of rows(); track row.ObservationID) {
              <tr><th scope="row">{{ row.Step }}</th><td>{{ row.ObservationID }}</td>@for (mic of selectedChannels; track mic) { <td>{{ row.values[mic] }}</td> }</tr>
            }</tbody>
          </table>
        </div></details>
      }
    </section>`,
  styles: [`
    :host { display: block; min-width: 0; margin: 32px; }
    section { padding: clamp(20px, 3vw, 36px); background: #0d1b2a; color: #b5ccdc; border: 1px solid #254056; border-radius: 20px; }
    h2 { color: #e7f4fc; font-size: clamp(24px, 2.5vw, 32px); margin: 0 0 12px; }
    h3 { color: #e7f4fc; margin: 0 0 16px; } p, figcaption { font-size: 15px; line-height: 1.7; }
    .controls { display: flex; flex-wrap: wrap; gap: 20px; margin: 24px 0; }
    .controls > div { display: grid; gap: 10px; min-width: 0; }
    label, legend { color: #e7f4fc; }
    select { box-sizing: border-box; min-height: 48px; max-width: 100%; padding: 10px 14px; border: 1px solid #357088; border-radius: 8px; background: #142a3b; color: #e7f4fc; font: inherit; }
    fieldset { display: flex; flex-wrap: wrap; gap: 8px 16px; border: 1px solid #254056; border-radius: 8px; padding: 12px; min-width: 0; }
    .channel { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; cursor: pointer; }
    input { width: 18px; height: 18px; accent-color: #31d7e8; } .swatch { width: 12px; height: 12px; border-radius: 50%; }
    select:focus-visible, input:focus-visible, summary:focus-visible, .table-scroll:focus-visible { outline: 2px solid #31d7e8; outline-offset: 4px; }
    figure { margin: 20px 0; min-width: 0; } .chart { position: relative; height: 420px; min-width: 0; }
    figcaption { border-top: 1px solid #254056; padding-top: 16px; margin-top: 16px; }
    summary { padding: 12px 0; cursor: pointer; color: #65e2f8; }
    .table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #254056; }
    @media (max-width: 700px) { :host { margin: 20px 16px; } section { padding: 20px 12px; } .controls { flex-direction: column; } select { width: 100%; } }
  `],
})
export class AcousticFeatureExplorer implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  private chart?: Chart<'line'>;
  readonly microphones = Array.from({ length: 8 }, (_, i) => `Mic${i + 3}`);
  readonly colors = ['#31d7e8', '#ffbf69', '#a9b6ff', '#8de0ad', '#f19dc9', '#f1e189', '#80b8ee', '#d9b99b'];
  readonly selected = new Set(this.microphones);
  readonly runs = signal<{ DatasetName: string; SequenceType: string }[]>([]);
  readonly rows = signal<AcousticPoint[]>([]);
  readonly runsLoading = signal(true);
  readonly loading = signal(false);
  readonly error = signal('');
  selectedRun = '';
  feature = 'rms';
  get selectedChannels(): string[] { return this.microphones.filter(mic => this.selected.has(mic)); }

  ngAfterViewInit(): void {
    this.http.get<{ DatasetName: string; SequenceType: string }[]>(`${this.api}/research/runs`)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: runs => { this.runs.set(runs); this.runsLoading.set(false); },
        error: () => { this.runsLoading.set(false); this.error.set('Unable to load acoustic experimental runs. Reload to retry.'); },
      });
  }

  load(): void {
    this.request?.unsubscribe();
    this.chart?.destroy(); this.chart = undefined;
    this.rows.set([]); this.error.set(''); this.loading.set(false);
    if (!this.selectedRun) return;
    this.loading.set(true);
    this.request = this.http.get<AcousticPoint[]>(`${this.api}/research/acoustic-features`, {
      params: { DatasetName: this.selectedRun, feature: this.feature },
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => { this.rows.set([...rows].sort((a, b) => a.Step - b.Step)); this.loading.set(false); this.render(); },
      error: () => { this.loading.set(false); this.error.set('Unable to load acoustic feature values. Select a run to retry.'); },
    });
  }

  toggle(mic: string): void {
    if (this.selected.has(mic)) this.selected.delete(mic); else this.selected.add(mic);
    this.render();
  }

  render(): void {
    this.chart?.destroy(); this.chart = undefined;
    if (!this.rows().length || !this.selected.size) return;
    const rows = this.rows();
    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'line',
      data: { datasets: this.selectedChannels.map(mic => ({
        label: `${mic}_rms`, data: rows.map(row => ({ x: row.Step, y: row.values[mic] })),
        borderColor: this.colors[this.microphones.indexOf(mic)], backgroundColor: this.colors[this.microphones.indexOf(mic)],
        borderDash: this.microphones.indexOf(mic) % 2 ? [6, 3] : [],
        pointStyle: ['circle', 'rect', 'triangle', 'rectRot'][this.microphones.indexOf(mic) % 4] as 'circle',
        pointRadius: 3, borderWidth: 2, tension: 0,
      })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => {
            const row = rows[context.dataIndex];
            const mic = this.selectedChannels[context.datasetIndex];
            return [`Run: ${row.DatasetName}`, `Step: ${row.Step}`, `Microphone: ${mic}`, `Feature: ${mic}_rms`, `Value: ${row.values[mic]} (exported units; physical units undocumented)`];
          } } },
        },
        scales: {
          x: { type: 'linear', min: 0, max: 20, title: { display: true, text: 'Experimental Step (0-20)', color: '#b5ccdc' }, ticks: { color: '#8ca5b9', stepSize: 2 }, grid: { color: '#254056' } },
          y: { title: { display: true, text: 'RMS amplitude (physical units undocumented)', color: '#b5ccdc' }, ticks: { color: '#8ca5b9' }, grid: { color: '#254056' } },
        },
      },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); this.chart?.destroy(); }
}
