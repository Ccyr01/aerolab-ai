import { TestBed } from '@angular/core/testing';
import { RunTimeline } from './run-timeline';

describe('Experimental run timeline', () => {
  it('preserves baseline and actual acquisition order for ascending, descending and randomized actions', async () => {
    spyOn(RunTimeline.prototype, 'ngAfterViewInit');
    const fixture = TestBed.createComponent(RunTimeline);
    const chart = fixture.componentInstance;
    fixture.detectChanges();
    const plotly = (await import('plotly.js-basic-dist-min')).default;
    const internals = chart as any;
    internals.plotly = plotly;
    for (const actions of [[0, 1, 2], [0, 20, 19], [0, 17, 3]]) {
      const rows = actions.map((CurrentAction, Step) => ({ ObservationID: `run_${Step}`, DatasetName: 'run', Step, CurrentAction, Delta_Cl: Step === 0 ? 0 : -0.01 * Step })).reverse();
      const original = JSON.stringify(rows);
      fixture.componentRef.setInput('run', 'run');
      fixture.componentRef.setInput('rows', rows);
      fixture.detectChanges();
      await fixture.whenStable();
      const plot = internals.plot.nativeElement;
      expect(plot.data.length).toBe(2);
      expect(plot.data[0].x).toEqual([0, 1, 2]);
      expect(plot.data[0].y).toEqual([0, -0.01, -0.02]);
      expect(plot.data[1].y).toEqual(actions);
      expect(plot.data[1].yaxis).toBe('y2');
      expect(plot.data[0].line.color).toBe('#31d7e8');
      expect(plot.data[1].line.color).toBe('#ffbf69');
      expect(plot.layout.yaxis2.overlaying).toBe('y');
      expect(plot.layout.yaxis2.side).toBe('right');
      expect(plot.data[1].hovertemplate).toContain('Hz');
      expect(plot.data[0].customdata[0]).toEqual(['run', 'run_0']);
      expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(3);
      expect(JSON.stringify(rows)).toBe(original);
    }
    fixture.destroy();
    expect(internals.plot.nativeElement.data).toBeUndefined();
  });
});
