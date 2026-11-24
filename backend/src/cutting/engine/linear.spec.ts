import { planLinear } from './linear';
import { Request, Source } from './types';

const roll = (id = 'r1', widthCm = 150, lengthCm = 2500): Source => ({ id, kind: 'ROLL', widthCm, lengthCm });
const rem = (id: string, widthCm: number, lengthCm: number): Source => ({ id, kind: 'REMNANT', widthCm, lengthCm });
const req = (sizeId: string, widthCm: number, lengthCm: number, qty: number): Request => ({ sizeId, widthCm, lengthCm, qty });

describe('planLinear', () => {
  it('8 carpets 150×300 from a 150×2500 roll are feasible and leave one 150×100 remnant', () => {
    const plan = planLinear([roll()], [req('s300', 150, 300, 8)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.placements).toHaveLength(8);
    expect(plan.remnants).toEqual([{ sourceId: 'r1', widthCm: 150, lengthCm: 100, xCm: 0, yCm: 2400 }]);
    expect(plan.shortfall).toEqual([]);
  });

  it('9 carpets 150×300 are not feasible: 8 are placed and 1 is missing', () => {
    const plan = planLinear([roll()], [req('s300', 150, 300, 9)], 30);
    expect(plan.feasible).toBe(false);
    expect(plan.placements).toHaveLength(8);
    expect(plan.shortfall).toEqual([{ sizeId: 's300', missing: 1 }]);
  });

  it('a carpet wider than every source is infeasible and does not throw', () => {
    const plan = planLinear([roll()], [req('wide', 200, 100, 2)], 30);
    expect(plan.feasible).toBe(false);
    expect(plan.placements).toEqual([]);
    expect(plan.shortfall).toEqual([{ sizeId: 'wide', missing: 2 }]);
  });

  it('a remnant is used before a roll when it fits', () => {
    const plan = planLinear([roll(), rem('m1', 150, 100)], [req('s100', 150, 100, 1)], 30);
    expect(plan.placements.map((p) => p.sourceId)).toEqual(['m1']);
    expect(plan.remnants).toEqual([]);
  });

  it('a roll that is not needed is left untouched', () => {
    const plan = planLinear([roll('r1'), roll('r2')], [req('s300', 150, 300, 2)], 30);
    expect(new Set(plan.placements.map((p) => p.sourceId))).toEqual(new Set(['r1']));
  });

  it('a tail shorter than the minimum remnant side is waste, not a remnant', () => {
    const plan = planLinear([roll('r1', 150, 320)], [req('s300', 150, 300, 1)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.remnants).toEqual([]);
  });

  it('two 100×200 pieces use two strips and leave a 50×200 gap remnant in each', () => {
    const plan = planLinear([roll('r1', 150, 500)], [req('s', 100, 200, 2)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.placements.map((p) => [p.xCm, p.yCm])).toEqual([[0, 0], [0, 200]]);
    expect(plan.remnants).toEqual(expect.arrayContaining([
      { sourceId: 'r1', widthCm: 50, lengthCm: 200, xCm: 100, yCm: 0 },
      { sourceId: 'r1', widthCm: 50, lengthCm: 200, xCm: 100, yCm: 200 },
      { sourceId: 'r1', widthCm: 150, lengthCm: 100, xCm: 0, yCm: 400 },
    ]));
  });

  it('pieces of equal length share a strip across the width', () => {
    const plan = planLinear([roll('r1', 150, 400)], [req('a', 100, 200, 1), req('b', 50, 200, 1)], 30);
    expect(plan.feasible).toBe(true);
    expect(plan.placements.every((p) => p.yCm === 0)).toBe(true);
    expect(plan.placements.map((p) => p.xCm).sort((x, y) => x - y)).toEqual([0, 100]);
  });

  it('is deterministic: the same input gives the same plan', () => {
    const input: [Source[], Request[], number] = [[roll('r1'), rem('m1', 150, 450)], [req('a', 150, 200, 5), req('b', 150, 300, 3)], 30];
    expect(planLinear(...input)).toEqual(planLinear(...input));
  });

  it('ignores zero quantities and rejects negative, fractional or non-positive sizes', () => {
    expect(planLinear([roll()], [req('a', 150, 200, 0)], 30).feasible).toBe(true);
    expect(() => planLinear([roll()], [req('a', 150, 200, -1)], 30)).toThrow(RangeError);
    expect(() => planLinear([roll()], [req('a', 150, 200, 1.5)], 30)).toThrow(RangeError);
    expect(() => planLinear([roll()], [req('a', 0, 200, 1)], 30)).toThrow(RangeError);
  });
});
