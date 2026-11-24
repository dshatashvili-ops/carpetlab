import { plan, suggestQuantities } from './index';
import { Source } from './types';

const roll = (id = 'r1', widthCm = 150, lengthCm = 2500): Source => ({ id, kind: 'ROLL', widthCm, lengthCm });
const size = (sizeId: string, widthCm: number, lengthCm: number) => ({ sizeId, widthCm, lengthCm });
const qtyOf = (reqs: { sizeId: string; qty: number }[]) => Object.fromEntries(reqs.map((r) => [r.sizeId, r.qty]));

describe('suggestQuantities', () => {
  const sizes = [size('150x150', 150, 150), size('150x200', 150, 200), size('150x300', 150, 300)];

  it('splits one 150×2500 roll between 150×150, 150×200, 150×300 as evenly as possible', () => {
    const result = suggestQuantities([roll()], sizes, 'LINEAR', 30);
    expect(qtyOf(result)).toEqual({ '150x150': 3, '150x200': 4, '150x300': 4 });
    const counts = result.map((r) => r.qty);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(plan('LINEAR', [roll()], result, 30).feasible).toBe(true);
  });

  it('gives zero to a size that cannot be cut at all and still fills the others', () => {
    const result = suggestQuantities([roll()], [size('wide', 200, 100), size('150x300', 150, 300)], 'LINEAR', 30);
    expect(qtyOf(result)).toEqual({ wide: 0, '150x300': 8 });
  });

  it('returns zeros when there is no material', () => {
    expect(qtyOf(suggestQuantities([], sizes, 'ANY', 30))).toEqual({ '150x150': 0, '150x200': 0, '150x300': 0 });
  });

  it('works in ANY mode and the suggestion is feasible', () => {
    const result = suggestQuantities([roll(), roll('r2')], [size('100x150', 100, 150), size('70x130', 70, 130)], 'ANY', 30);
    expect(plan('ANY', [roll(), roll('r2')], result, 30).feasible).toBe(true);
    expect(result.every((r) => r.qty > 0)).toBe(true);
  });
});
