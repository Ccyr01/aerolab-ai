import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { FeaturePerformanceChart, SupervisedResult } from './feature-performance';

describe('Feature performance chart', () => {
  it('orders subsets, binds fold SD and hover metrics, switches target and predictors, and cleans up Plotly', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    spyOn(FeaturePerformanceChart.prototype, 'ngAfterViewInit');
    const fixture = TestBed.createComponent(FeaturePerformanceChart);
    fixture.detectChanges();
    const chart = fixture.componentInstance;
    const internal = chart as any;
    internal.plotly = (await import('plotly.js-basic-dist-min')).default;
    const rows: SupervisedResult[] = [];
    for (const target of ['CL', 'R'] as const) for (const model of ['Ridge', 'RandomForest'] as const)
      for (const representation of ['Microphones', 'Action + Microphones'] as const)
        for (const subset of [...chart.subsets].reverse()) rows.push({ target, model, representation, subset,
          n_features: subset === 'All' ? 177.8 : Number(subset),
          R2_mean: target === 'CL' ? 0.6 : 0.4, R2_std: 0.05,
          MAE_mean: 0.01, MAE_std: 0.002, RMSE_mean: 0.02, RMSE_std: 0.003 });
    internal.rows = rows;
    const original = JSON.stringify(rows);
    chart.loading.set(false);
    chart.render();
    await fixture.whenStable();
    const plot = internal.plot.nativeElement;
    expect(plot.data.length).toBe(2);
    expect(plot.data[0].x).toEqual(['5', '10', '20', '30', '50', 'All']);
    expect(plot.data[0].y).toEqual([0.6, 0.6, 0.6, 0.6, 0.6, 0.6]);
    expect(plot.data[0].error_y.array).toEqual([0.05, 0.05, 0.05, 0.05, 0.05, 0.05]);
    expect(plot.data[0].customdata[5][1]).toBe(177.8);
    expect(plot.data[0].hovertemplate).toContain('RMSE');
    expect(plot.layout.annotations[0].x).toBe('30');
    expect(plot.layout.annotations[0].yref).toBe('y');
    expect(plot.layout.annotations[0].y).toBe(plot.data[1].y[3]);
    expect(plot.layout.annotations[0].showarrow).toBeTrue();
    expect(plot.layout.xaxis.tickangle).toBe(0);
    expect(plot.layout.xaxis.ticktext).toEqual(['5', '10', '20', '30', '50', 'All']);
    fixture.detectChanges();
    const target: HTMLSelectElement = fixture.nativeElement.querySelector('#performance-target');
    target.value = 'R'; target.dispatchEvent(new Event('change'));
    const predictors: HTMLSelectElement = fixture.nativeElement.querySelector('#performance-predictors');
    predictors.value = 'Action + Microphones'; predictors.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(plot.data[0].y[0]).toBe(0.4);
    expect(plot.layout.annotations[0].y).toBe(0.4);
    expect(plot.data[0].customdata[0].slice(7)).toEqual(['R', 'Action + Microphones']);
    expect(JSON.stringify(rows)).toBe(original);
    fixture.destroy();
    expect(plot.data).toBeUndefined();
  });
});
