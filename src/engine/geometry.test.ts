import { describe, expect, it } from 'vitest';
import * as G from './geometry';
import { costModel } from '~/templates/kit';

describe('geometry', () => {
  it('intersects straight lines', () => {
    const p = G.meet(G.lineX([5, 5], -1, 0, 10), G.lineX([5, 5], 1, 0, 10));
    expect(p[0]).toBeCloseTo(5);
    expect(p[1]).toBeCloseTo(5);
  });

  it('extends straight lines that do not overlap', () => {
    const p = G.meet([[0, 0], [1, 1]], [[4, 0], [3, 1]]);
    expect(p[0]).toBeCloseTo(2);
    expect(p[1]).toBeCloseTo(2);
  });

  it('interpolates and extrapolates y and x', () => {
    const c = G.lineX([0, 10], -1, 0, 10);
    expect(G.yAt(c, 3)).toBeCloseTo(7);
    expect(G.yAt(c, 12)).toBeCloseTo(-2);
    expect(G.xAt(c, 4)).toBeCloseTo(6);
  });

  it('builds the area between two curves', () => {
    const d = G.lineX([0, 10], -1, 0, 10);
    const poly = G.between(d, G.hline(5, 0, 5), 0, 5);
    expect(G.polygonArea(poly)).toBeCloseTo(12.5);
  });

  it('clips polylines and polygons to a box', () => {
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
    const runs = G.clipPolyline([[-5, 5], [15, 5]], box);
    expect(runs).toHaveLength(1);
    expect(runs[0][0][0]).toBeCloseTo(0);
    expect(runs[0][1][0]).toBeCloseTo(10);
    const poly = G.clipPolygon(G.rect(-5, -5, 5, 5), box);
    expect(G.polygonArea(poly)).toBeCloseTo(25);
  });

  it('monotone spline passes through its knots without overshoot', () => {
    const pts = G.spline([[0, 0], [1, 5], [2, 6], [3, 6.2]]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([3, 6.2]);
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(6.2 + 1e-9);
  });

  it('solves and minimises', () => {
    expect(G.solve((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2);
    expect(G.argmin((x) => (x - 3) ** 2, 0, 10)).toBeCloseTo(3);
  });
});

describe('cost model', () => {
  it('MC passes through the minimum of AVC and ATC', () => {
    const c = costModel();
    const [qv, v] = c.minAVC;
    expect(c.mc(qv)).toBeCloseTo(v, 6);
    const [qa, a] = c.minATC;
    expect(c.mc(qa)).toBeCloseTo(a, 4);
    expect(c.qAtMC(c.mc(7))).toBeCloseTo(7, 6);
  });
});
