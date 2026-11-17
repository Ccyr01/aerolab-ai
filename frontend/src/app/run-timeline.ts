import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, signal } from '@angular/core';
import type { Data } from 'plotly.js';

export interface TimelineObservation {
  ObservationID: string; DatasetName: string; Step: number; CurrentAction: number; Delta_Cl: number;
}

@Component({
  selector: 'app-run-timeline',
  template: `
    <h3>Lift and Forcing Frequency by Experimental Step</h3>
    <p>{{ run }} · Actual observations in acquisition order, including baseline step 0.</p>
    @if (error()) { <p role="alert">{{ error() }}</p> }
    <div #plot role="img" [attr.aria-label]="'Measured lift change and applied forcing frequency by experimental step for ' + run"></div>
    <p>Left axis: measured ΔCL (dimensionless), cyan. Right axis: applied forcing frequency (Hz), amber. Lines connect observations; no averaging or interpolation of values.</p>
    <details><summary>View exact timeline values</summary>
      <div class="table-scroll"><table><caption>{{ run }} timeline observations</caption>
        <thead><tr><th scope="col">Step</th><th scope="col">Observation</th><th scope="col">ΔCL (dimensionless)</th><th scope="col">Forcing frequency (Hz)</th></tr></thead>
        <tbody>@for (row of ordered; track row.ObservationID) {
          <tr><th scope="row">{{ row.Step }}</th><td>{{ row.ObservationID }}</td><td>{{ row.Delta_Cl }}</td><td>{{ row.CurrentAction }}</td></tr>
        }</tbody>
      </table></div>
    </details>`,
  styles: [`
    :host { display: block; min-width: 0; margin-top: 24px; border-top: 1px solid #233b57; padding-top: 16px; color: #b5ccdc; }
    h3 { color: #eaf4ff; font-size: 18px; margin: 0 0 10px; }
    p { font-size: 14px; line-height: 1.6; }
    [role=img] { width: 100%; height: 460px; min-width: 0; }
    .table-scroll { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #254056; }
    summary { padding: 12px 0; cursor: pointer; color: #65e2f8; }
    summary:focus-visible { outline: 2px solid #31d7e8; outline-offset: 4px; }
  `],
})
export class RunTimeline implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rows: TimelineObservation[] = [];
  @Input() run = '';
  @ViewChild('plot', { static: true }) plot!: ElementRef<HTMLDivElement>;
  readonly error = signal('');
  ordered: TimelineObservation[] = [];
  private plotly?: typeof import('plotly.js');
  private observer?: ResizeObserver;
  private destroyed = false;

  ngOnChanges(): void {
    this.ordered = this.rows.filter(row => row.DatasetName === this.run).sort((a, b) => a.Step - b.Step);
    this.render();
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      this.plotly = (await import('plotly.js-basic-dist-min')).default;
      if (this.destroyed) return;
      this.observer = new ResizeObserver(() => {
        if (!this.destroyed) void this.plotly?.Plots.resize(this.plot.nativeElement);
      });
      this.render();
    } catch { if (!this.destroyed) this.error.set('Unable to load the experimental timeline. Exact values remain available below.'); }
  }

  render(): void {
    if (!this.plotly || !this.plot || this.destroyed) return;
    const x = this.ordered.map(row => row.Step);
    const customdata = this.ordered.map(row => [row.DatasetName, row.ObservationID]);
    const traces: Data[] = [
      { type: 'scatter', mode: 'lines+markers', name: 'Measured ΔCL', x, y: this.ordered.map(row => row.Delta_Cl),
        line: { color: '#31d7e8', shape: 'linear' }, marker: { color: '#31d7e8', symbol: 'circle' }, customdata,
        hovertemplate: 'Run: %{customdata[0]}<br>Observation: %{customdata[1]}<br>Step: %{x}<br>ΔCL: %{y} (dimensionless)<extra></extra>' },
      { type: 'scatter', mode: 'lines+markers', name: 'Applied forcing frequency', x, y: this.ordered.map(row => row.CurrentAction), yaxis: 'y2',
        line: { color: '#ffbf69', dash: 'dash', shape: 'linear' }, marker: { color: '#ffbf69', symbol: 'diamond' }, customdata,
        hovertemplate: 'Run: %{customdata[0]}<br>Observation: %{customdata[1]}<br>Step: %{x}<br>Applied forcing frequency: %{y} Hz<extra></extra>' },
    ];
    void this.plotly.react(this.plot.nativeElement, traces, {
      autosize: true, paper_bgcolor: '#0d1b2a', plot_bgcolor: '#0d1b2a', font: { color: '#e0edf7', size: 14 },
      margin: { l: 65, r: 65, t: 70, b: 65 }, hovermode: 'x unified',
      legend: { orientation: 'h', x: 0, y: 1.08, yanchor: 'bottom' },
      xaxis: { title: { text: 'Experimental Step (0–20)' }, range: [-0.3, 20.3], dtick: 2, gridcolor: '#254056', automargin: true },
      yaxis: { title: { text: 'Measured ΔCL (dimensionless)' }, color: '#31d7e8', gridcolor: '#254056', automargin: true },
      yaxis2: { title: { text: 'Applied forcing frequency (Hz)' }, color: '#ffbf69', overlaying: 'y', side: 'right', showgrid: false, automargin: true },
    }, { responsive: true, displaylogo: false, scrollZoom: false }).then(() => {
      if (!this.destroyed) this.observer?.observe(this.plot.nativeElement);
    }).catch(() => { if (!this.destroyed) this.error.set('Unable to display the timeline. Exact values remain available below.'); });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.plotly?.purge(this.plot.nativeElement);
  }
}
