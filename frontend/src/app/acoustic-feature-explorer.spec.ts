import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import Chart from 'chart.js/auto';
import { AcousticFeatureExplorer } from './acoustic-feature-explorer';
import { API_BASE_URL } from './api-config';

describe('Acoustic feature explorer', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: 'http://test-api' }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('selects runs, preserves actual values, toggles any channel combination and exposes exact accessible data', async () => {
    const fixture = TestBed.createComponent(AcousticFeatureExplorer);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    http.expectOne('http://test-api/research/runs').flush([{ DatasetName: 'run_1', SequenceType: 'random' }, { DatasetName: 'run_2', SequenceType: 'ascending' }]);
    fixture.detectChanges();
    await fixture.whenStable();
    const run: HTMLSelectElement = fixture.nativeElement.querySelector('#acoustic-run');
    expect(run.options.length).toBe(3);
    const feature: HTMLSelectElement = fixture.nativeElement.querySelector('#acoustic-feature');
    expect(Array.from(feature.options).map(o => o.value)).toEqual(['rms']);
    run.value = 'run_1'; run.dispatchEvent(new Event('change')); fixture.detectChanges();
    const rows = [2, 0, 1].map(Step => ({ ObservationID: `run_1_${Step}`, SignalIndex: Step, DatasetName: 'run_1', SequenceType: 'random', Step,
      values: Object.fromEntries(component.microphones.map((mic, i) => [mic, 0.1234567890123456 + i + Step])) }));
    const original = JSON.stringify(rows);
    http.expectOne('http://test-api/research/acoustic-features?DatasetName=run_1&feature=rms').flush(rows);
    fixture.detectChanges();
    const canvas: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
    let chart = Chart.getChart(canvas)!;
    expect(chart.data.datasets.length).toBe(8);
    expect(chart.data.datasets[0].data).toEqual([0, 1, 2].map(x => ({ x, y: 0.1234567890123456 + x })));
    const callback = chart.options.plugins!.tooltip!.callbacks!.label as any;
    expect(callback({ dataIndex: 0, datasetIndex: 0 })).toEqual(['Run: run_1', 'Step: 0', 'Microphone: Mic3', 'Feature: Mic3_rms', 'Value: 0.1234567890123456 (exported units; physical units undocumented)']);
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(3);
    const boxes: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input[type=checkbox]'));
    boxes[0].click(); fixture.detectChanges();
    chart = Chart.getChart(canvas)!;
    expect(chart.data.datasets.length).toBe(7);
    expect(chart.data.datasets[0].label).toBe('Mic4_rms');
    boxes.slice(1).forEach(box => box.click()); fixture.detectChanges();
    expect(Chart.getChart(canvas)).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Select at least one microphone');
    boxes[7].click(); fixture.detectChanges();
    expect(Chart.getChart(canvas)!.data.datasets[0].label).toBe('Mic10_rms');
    expect(JSON.stringify(rows)).toBe(original);
    feature.dispatchEvent(new Event('change')); fixture.detectChanges();
    http.expectOne('http://test-api/research/acoustic-features?DatasetName=run_1&feature=rms').flush(rows);
    fixture.detectChanges();
    const destroy = spyOn(Chart.getChart(canvas)!, 'destroy').and.callThrough();
    fixture.destroy(); expect(destroy).toHaveBeenCalled();
  });

  it('cancels stale requests, handles failure and clears values when no run is selected', () => {
    const fixture = TestBed.createComponent(AcousticFeatureExplorer); fixture.detectChanges();
    const c = fixture.componentInstance;
    http.expectOne('http://test-api/research/runs').flush([]);
    c.selectedRun = 'old'; c.load();
    const old = http.expectOne('http://test-api/research/acoustic-features?DatasetName=old&feature=rms');
    c.selectedRun = 'new'; c.load(); expect(old.cancelled).toBeTrue();
    http.expectOne('http://test-api/research/acoustic-features?DatasetName=new&feature=rms').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges(); expect(c.loading()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Unable to load acoustic feature');
    c.selectedRun = 'pending'; c.load();
    const pending = http.expectOne('http://test-api/research/acoustic-features?DatasetName=pending&feature=rms');
    c.selectedRun = ''; c.load(); expect(pending.cancelled).toBeTrue(); expect(c.rows()).toEqual([]);
    fixture.destroy();
  });
});
