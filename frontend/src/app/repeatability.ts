import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Data } from 'plotly.js';
import { API_BASE_URL } from './api-config';

interface RepeatabilityPoint {
  SequenceGroup: string;
  Step: number;
  CurrentAction: number;
  Mean_Delta_Cl: number;
  SD_Delta_Cl: number;
  RunCount: number;
}

@Component({
  selector: 'app-repeatability',
  imports: [FormsModule],
  template: `
    <section aria-labelledby="repeatability-title">
      <header>
      <h2 id="repeatability-title">Aerodynamic Lift Repeatability</h2>
      <p>Mean lift response with shaded ±1 between-run sample SD. The bands show variability across repeated runs, not confidence intervals.</p>
      </header>
      <div class="sequence-control">
      <label for="repeatability-sequence">Sequence pattern</label>
      <select id="repeatability-sequence" [(ngModel)]="selected" (ngModelChange)="render()" [disabled]="loading() || !!error()">
        <option value="comparison">Ascending + Descending</option>
        @for (group of groupNames; track group) {
          <option [value]="group">{{ label(group) }}</option>
        }
      </select>
      <label for="repeatability-axis">X-axis</label>
      <select id="repeatability-axis" [(ngModel)]="xAxis" (ngModelChange)="render()" [disabled]="loading() || !!error()">
        <option value="step">Experimental Step</option>
        <option value="frequency">Forcing Frequency (Hz)</option>
      </select>
      </div>
      @if (loading()) { <p role="status">Loading repeatability summary...</p> }
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <figure>
      <div #plot role="img" aria-describedby="repeatability-caption" [attr.aria-label]="'Mean lift response and one between-run sample SD for ' + label(selected) + ' by ' + (xAxis === 'step' ? 'experimental step' : 'forcing frequency in Hz')"></div>
      <figcaption id="repeatability-caption">
      @if (!loading() && !error()) {
        <p>{{ runSummary() }} · 21 experimental steps per sequence. Shading: ±1 between-run sample SD. Hover for sequence, forcing frequency (Hz), step, mean ΔCl, sample SD, and run count.</p>
        <p>{{ xAxis === 'frequency' ? 'Points are sorted by forcing frequency within each sequence.' : 'Points follow experimental acquisition order within each sequence.' }}</p>
      }
      </figcaption>
      </figure>
    </section>`,
  styles: [`
    :host { display: block; margin: 32px; min-width: 0; }
    section { background: #0d1b2a; color: #b5ccdc; border: 1px solid #254056; border-radius: 20px; padding: clamp(20px, 3vw, 36px); }
    h2 { color: #e7f4fc; margin: 0 0 16px; font-size: clamp(24px, 2.5vw, 32px); line-height: 1.25; }
    p { margin: 0; font-size: 16px; line-height: 1.7; }
    header p { max-width: 850px; }
    .sequence-control { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; margin: 28px 0 16px; }
    label { color: #e7f4fc; font-size: 16px; font-weight: 600; }
    select { box-sizing: border-box; min-height: 48px; width: 280px; padding: 10px 14px; border: 1px solid #357088; border-radius: 8px; background: #142a3b; color: #e7f4fc; max-width: 100%; font: inherit; font-size: 16px; }
    select:focus-visible { outline: 2px solid #31d7e8; outline-offset: 4px; }
    figure { margin: 0; min-width: 0; }
    [role=img] { width: 100%; height: 580px; min-width: 0; }
    figcaption { border-top: 1px solid #254056; padding-top: 20px; margin-top: 12px; }
    figcaption p { font-size: 15px; }
    figcaption p + p { margin-top: 8px; }
    @media (max-width: 700px) {
      :host { margin: 20px 16px; }
      section { padding: 20px 12px; }
      .sequence-control { align-items: stretch; flex-direction: column; }
      select { width: 100%; }
      [role=img] { height: 500px; }
    }
  `],
})
export class RepeatabilityChart implements AfterViewInit, OnDestroy {
  @ViewChild('plot', { static: true }) plot!: ElementRef<HTMLDivElement>;
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly destroyRef = inject(DestroyRef);
  private plotly?: typeof import('plotly.js');
  private observer?: ResizeObserver;
  private destroyed = false;
  private groups: Record<string, RepeatabilityPoint[]> = {};
  readonly groupNames = ['ascending', 'descending', 'random_1', 'random_2', 'random_3', 'random_4', 'random_5'];
  readonly loading = signal(true);
  readonly error = signal('');
  readonly runCount = signal(0);
  readonly runSummary = signal('');
  selected = 'ascending';
  xAxis: 'step' | 'frequency' = 'step';

  label(group: string): string {
    if (group === 'comparison') return 'Ascending + Descending';
    return group.startsWith('random_') ? `Randomized pattern ${group.slice(-1)}` : group === 'ascending' ? 'Ascending' : 'Descending';
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      this.plotly = (await import('plotly.js-basic-dist-min')).default;
      if (this.destroyed) return;
      this.observer = new ResizeObserver(() => { void this.plotly?.Plots.resize(this.plot.nativeElement); });
      this.http.get<Record<string, RepeatabilityPoint[]>>(`${this.api}/research/repeatability`)
        .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: (groups) => { this.groups = groups; this.loading.set(false); this.render(); },
          error: () => { this.loading.set(false); this.error.set('Unable to load repeatability summary. Check the API connection.'); },
        });
    } catch {
      this.loading.set(false);
      this.error.set('Unable to load the interactive chart. Reload the page to retry.');
    }
  }

  render(): void {
    if (!this.plotly || this.destroyed) return;
    const names = this.selected === 'comparison' ? ['ascending', 'descending'] : [this.selected];
    const traces: Data[] = [];
    const summaries: string[] = [];
    for (const name of names) {
      const rows = [...(this.groups[name] ?? [])].sort((a, b) => this.xAxis === 'frequency'
        ? a.CurrentAction - b.CurrentAction || a.Step - b.Step : a.Step - b.Step);
      if (!rows.length) return;
      const descending = name === 'descending';
      const color = descending ? '#ffbf69' : '#4de3f3';
      const fillcolor = descending ? 'rgba(255,191,105,0.20)' : 'rgba(77,227,243,0.20)';
      const x = rows.map(row => this.xAxis === 'frequency' ? row.CurrentAction : row.Step);
      summaries.push(`${this.label(name)}: ${rows[0].RunCount} repeated runs`);
      this.runCount.set(rows[0].RunCount);
      traces.push(
        { x, y: rows.map(row => row.Mean_Delta_Cl - row.SD_Delta_Cl), legendgroup: name, type: 'scatter', mode: 'lines', line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
        { x, y: rows.map(row => row.Mean_Delta_Cl + row.SD_Delta_Cl), legendgroup: name, type: 'scatter', mode: 'lines', line: { width: 0 }, fill: 'tonexty', fillcolor, hoverinfo: 'skip', showlegend: false },
        { x, y: rows.map(row => row.Mean_Delta_Cl), legendgroup: name, type: 'scatter', mode: 'lines+markers', name: `${this.label(name)} mean ΔCl`,
          line: { color, width: 3, dash: descending ? 'dash' : 'solid' }, marker: { color, size: 7, symbol: descending ? 'diamond' : 'circle' },
          customdata: rows.map(row => [row.CurrentAction, row.SD_Delta_Cl, row.RunCount, row.Step, this.label(name)]),
          hovertemplate: 'Sequence: %{customdata[4]}<br>Forcing frequency: %{customdata[0]} Hz<br>Step: %{customdata[3]}<br>Mean ΔCl: %{y:.5f}<br>Between-run sample SD: %{customdata[1]:.5f}<br>Runs: %{customdata[2]}<extra></extra>' },
      );
    }
    this.runSummary.set(summaries.join(' · '));
    void this.plotly.react(this.plot.nativeElement, traces, {
      autosize: true, paper_bgcolor: '#0d1b2a', plot_bgcolor: '#0d1b2a', font: { color: '#e0edf7', size: 16 },
      margin: { l: 80, r: 20, t: 80, b: 100 },
      legend: { orientation: 'h', x: 0, y: 1.04, xanchor: 'left', yanchor: 'bottom', font: { size: 15 }, groupclick: 'togglegroup' },
      hoverlabel: { font: { size: 15 } },
      xaxis: { title: { text: this.xAxis === 'frequency' ? 'Forcing Frequency (Hz)' : 'Experimental step<br>(acquisition order)', font: { size: 16 }, standoff: 18 }, automargin: true, tickfont: { size: 14 }, dtick: 2, gridcolor: '#254056' },
      yaxis: { title: { text: 'ΔCl (dimensionless)', font: { size: 16 }, standoff: 18 }, automargin: true, tickfont: { size: 14 }, gridcolor: '#254056', zerolinecolor: '#557795' },
    }, { responsive: true, displaylogo: false }).then(() => {
      if (!this.destroyed) this.observer?.observe(this.plot.nativeElement);
    }).catch(() => this.error.set('Unable to display the repeatability chart.'));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.plotly?.purge(this.plot.nativeElement);
  }
}
