import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import Chart from 'chart.js/auto';
import { App } from './app';
import { routes } from './app.routes';
import { API_BASE_URL } from './api-config';
import { ResearchPage } from './research';
import { DemoPage } from './demo';
import { Component } from '@angular/core';
import { RepeatabilityChart } from './repeatability';
import { FeaturePerformanceChart } from './feature-performance';
import { RunTimeline } from './run-timeline';
import { AcousticFeatureExplorer } from './acoustic-feature-explorer';
import { Input } from '@angular/core';

@Component({ selector: 'app-run-timeline', template: '' })
class TimelineStub { @Input() rows: unknown[] = []; @Input() run = ''; }
@Component({ selector: 'app-acoustic-feature-explorer', template: '' })
class AcousticStub {}

@Component({ selector: 'app-feature-performance', template: '' })
class FeaturePerformanceStub {}

@Component({ selector: 'app-repeatability', template: '' })
class RepeatabilityStub {}

 describe('AeroLab routed pages', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'http://test-api' }],
    });
    TestBed.overrideComponent(ResearchPage, {
      remove: { imports: [RepeatabilityChart, FeaturePerformanceChart, RunTimeline, AcousticFeatureExplorer] },
      add: { imports: [RepeatabilityStub, FeaturePerformanceStub, TimelineStub, AcousticStub] },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify({ ignoreCancelled: true }));

  it('renders links to both pages', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/research', '/demo']);
  });

  it('redirects home to research, sorts run charts, and destroys charts on navigation', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/', ResearchPage);
    expect(TestBed.inject(Router).url).toBe('/research');
    expect(page.selectedResearchRun).toBe('');
    expect(page.researchLoading()).toBeTrue();
    http.expectOne('http://test-api/research/runs').flush([{ DatasetName: 'downward_10', SequenceType: 'descending' }, { DatasetName: 'run_1', SequenceType: 'ascending' }]);
    const rows = Array.from({ length: 21 }, (_, step) => ({
      ObservationID: `run_1_${step}`, DatasetName: 'run_1', Step: step,
      SequenceType: 'ascending', CurrentAction: step, Delta_Cl: step / 100,
    })).reverse();
    const multiRunRows = Array.from({ length: 200 }, (_, i) => ({
      ...rows[i % rows.length], ObservationID: `observation_${i}`, DatasetName: `run_${Math.floor(i / 21)}`,
    }));
    http.expectOne('http://test-api/research/action-lift?limit=200').flush(multiRunRows);
    harness.detectChanges();
    expect(page.researchLoading()).toBeFalse();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect((harness.routeNativeElement!.querySelector('#researchRun') as HTMLSelectElement).value).toBe('');
    const initialCanvases = Array.from(harness.routeNativeElement!.querySelector('#research-analytics')!.querySelectorAll('canvas'));
    expect(initialCanvases.length).toBe(1);
    expect(Chart.getChart(initialCanvases[0])!.data.datasets[0].data.length).toBe(200);
    expect(harness.routeNativeElement!.textContent).toContain('Select a specific experimental run');

    page.selectedResearchRun = 'run_1';
    page.loadResearchObservations();
    harness.detectChanges();
    http.expectOne('http://test-api/research/action-lift?limit=200&DatasetName=run_1').flush(rows);
    harness.detectChanges();
    const canvases = Array.from(harness.routeNativeElement!.querySelector('#research-analytics')!.querySelectorAll('canvas'));
    expect(canvases.length).toBe(1);
    expect(harness.routeNativeElement!.querySelector('app-run-timeline')).not.toBeNull();
    const charts = Array.from(harness.routeNativeElement!.querySelectorAll('canvas')).map((canvas) => Chart.getChart(canvas)!);
    expect(charts.length).toBe(2);
    expect(charts[0].data.datasets[0].data).toEqual([0.242, 0.727, 0.745]);
    const destroySpies = charts.map((chart) => spyOn(chart, 'destroy').and.callThrough());
    await harness.navigateByUrl('/demo', DemoPage);
    destroySpies.forEach((spy) => expect(spy).toHaveBeenCalled());
    expect(harness.routeNativeElement!.textContent).toContain('Hyperparameter Lab');
    const comparison = http.expectOne('http://test-api/models/comparison');
    await harness.navigateByUrl('/research', ResearchPage);
    expect(comparison.cancelled).toBeTrue();
    http.expectOne('http://test-api/research/runs').flush([]);
    http.expectOne('http://test-api/research/action-lift?limit=200').flush([]);
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('No research observations available.');
  });
  it('cancels initial observations on run switch and pending requests on navigation', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/research', ResearchPage);
    const initial = http.expectOne('http://test-api/research/action-lift?limit=200');
    const runs = http.expectOne('http://test-api/research/runs');
    page.selectedResearchRun = 'other_run';
    page.loadResearchObservations();
    expect(initial.cancelled).toBeTrue();
    const replacement = http.expectOne('http://test-api/research/action-lift?limit=200&DatasetName=other_run');
    await harness.navigateByUrl('/demo', DemoPage);
    expect(replacement.cancelled).toBeTrue();
    expect(runs.cancelled).toBeTrue();
    http.expectOne('http://test-api/models/comparison').flush({ baseline: [], tuned: [] });
  });

  it('shows an error when the initial run request fails without retrying', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/research', ResearchPage);
    http.expectOne('http://test-api/research/runs').flush([]);
    http.expectOne('http://test-api/research/action-lift?limit=200')
      .flush({ detail: 'Dataset unavailable' }, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();
    expect(page.researchLoading()).toBeFalse();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')!.textContent)
      .toContain('Unable to load research observations');
  });

});
