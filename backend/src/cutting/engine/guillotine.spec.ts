import { planAny } from './guillotine';
import { Placement, Request, Source } from './types';

const roll = (id = 'r1', widthCm = 150, lengthCm = 2500): Source => ({ id, kind: 'ROLL', widthCm, lengthCm });
const rem = (id: string, widthCm: number, lengthCm: number): Source => ({ id, kind: 'REMNANT', widthCm, lengthCm });
const req = (sizeId: string, widthCm: number, lengthCm: number, qty: number): Request => ({ sizeId, widthCm, lengthCm, qty });

function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const overlap = (a: Placement, b: Placement): boolean =>
  a.xCm < b.xCm + b.widthCm && b.xCm < a.xCm + a.widthCm && a.yCm < b.yCm + b.lengthCm && b.yCm < a.yCm + a.lengthCm;

describe('planAny', () => {
  it('10 carpets 100×150 from a 150×2500 roll are feasible and use exactly 150000 cm²', () => {
    const plan = planAny([roll()], [req('s', 100, 150, 10)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.placements.reduce((a, p) => a + p.widthCm * p.lengthCm, 0)).toBe(10 * 100 * 150);
  });

  it('a 100×150 carpet fits a 150×100 remnant only when rotated', () => {
    const plan = planAny([rem('m1', 150, 100)], [req('s', 100, 150, 1)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.placements).toEqual([{ sourceId: 'm1', sizeId: 's', xCm: 0, yCm: 0, widthCm: 150, lengthCm: 100 }]);
  });

  it('a carpet larger than every source is infeasible and does not throw', () => {
    const plan = planAny([roll('r1', 150, 400)], [req('big', 500, 500, 1)], 30);
    expect(plan.feasible).toBe(false);
    expect(plan.shortfall).toEqual([{ sizeId: 'big', missing: 1 }]);
  });

  it('uses remnants before rolls', () => {
    const plan = planAny([roll(), rem('m1', 150, 200)], [req('s', 150, 200, 1)], 30);
    expect(plan.placements.map((p) => p.sourceId)).toEqual(['m1']);
  });

  it('is deterministic', () => {
    const input: [Source[], Request[], number] = [[roll(), rem('m1', 120, 340)], [req('a', 70, 130, 6), req('b', 150, 90, 4)], 30];
    expect(planAny(...input)).toEqual(planAny(...input));
  });

  it('never overlaps, never leaves the source and conserves area (200 random cases)', () => {
    const rnd = mulberry32(42);
    const pick = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
    for (let i = 0; i < 200; i++) {
      const sources: Source[] = Array.from({ length: pick(1, 3) }, (_, k) => (rnd() < 0.4 ? rem(`m${k}`, pick(40, 200), pick(40, 400)) : roll(`r${k}`, pick(100, 200), pick(300, 1200))));
      const requests: Request[] = Array.from({ length: pick(1, 4) }, (_, k) => req(`s${k}`, pick(30, 160), pick(30, 300), pick(1, 6)));
      const plan = planAny(sources, requests, 30);
      const bySource = new Map(sources.map((s) => [s.id, s]));
      for (const p of plan.placements) {
        const s = bySource.get(p.sourceId)!;
        expect(p.xCm).toBeGreaterThanOrEqual(0); expect(p.yCm).toBeGreaterThanOrEqual(0);
        expect(p.xCm + p.widthCm).toBeLessThanOrEqual(s.widthCm); expect(p.yCm + p.lengthCm).toBeLessThanOrEqual(s.lengthCm);
      }
      for (let a = 0; a < plan.placements.length; a++) for (let b = a + 1; b < plan.placements.length; b++) {
        if (plan.placements[a].sourceId === plan.placements[b].sourceId) expect(overlap(plan.placements[a], plan.placements[b])).toBe(false);
      }
      for (const s of sources) {
        const used = plan.placements.filter((p) => p.sourceId === s.id).reduce((acc, p) => acc + p.widthCm * p.lengthCm, 0);
        const left = plan.remnants.filter((r) => r.sourceId === s.id).reduce((acc, r) => acc + r.widthCm * r.lengthCm, 0);
        expect(used + left).toBeLessThanOrEqual(s.widthCm * s.lengthCm);
      }
      for (const r of plan.remnants) {
        expect(r.widthCm).toBeGreaterThanOrEqual(30); expect(r.lengthCm).toBeGreaterThanOrEqual(30);
        const s = bySource.get(r.sourceId)!;
        expect(r.xCm).toBeGreaterThanOrEqual(0); expect(r.yCm).toBeGreaterThanOrEqual(0);
        expect(r.xCm + r.widthCm).toBeLessThanOrEqual(s.widthCm); expect(r.yCm + r.lengthCm).toBeLessThanOrEqual(s.lengthCm);
        const asPlacement: Placement = { sourceId: r.sourceId, sizeId: 'rem', xCm: r.xCm, yCm: r.yCm, widthCm: r.widthCm, lengthCm: r.lengthCm };
        for (const p of plan.placements) if (p.sourceId === r.sourceId) expect(overlap(p, asPlacement)).toBe(false);
        for (const o of plan.remnants) if (o !== r && o.sourceId === r.sourceId) expect(overlap({ ...asPlacement }, { sourceId: o.sourceId, sizeId: 'rem', xCm: o.xCm, yCm: o.yCm, widthCm: o.widthCm, lengthCm: o.lengthCm })).toBe(false);
      }
      const placed = new Map<string, number>();
      plan.placements.forEach((p) => placed.set(p.sizeId, (placed.get(p.sizeId) ?? 0) + 1));
      for (const r of requests) expect((placed.get(r.sizeId) ?? 0) + (plan.shortfall.find((s) => s.sizeId === r.sizeId)?.missing ?? 0)).toBe(r.qty);
    }
  });

  it('rejects negative quantities with RangeError', () => {
    expect(() => planAny([roll()], [req('a', 100, 100, -1)], 30)).toThrow(RangeError);
  });
});
