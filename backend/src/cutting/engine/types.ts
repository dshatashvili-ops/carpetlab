/** All dimensions are integer centimetres. x runs across the source width, y along its length. */
export type Source = { id: string; kind: 'ROLL' | 'REMNANT'; widthCm: number; lengthCm: number };
export type Request = { sizeId: string; widthCm: number; lengthCm: number; qty: number };
export type Placement = { sourceId: string; sizeId: string; xCm: number; yCm: number; widthCm: number; lengthCm: number };
export type RemnantOut = { sourceId: string; widthCm: number; lengthCm: number; xCm: number; yCm: number };
export type CutPlan = {
  feasible: boolean;
  placements: Placement[];
  remnants: RemnantOut[];
  shortfall: { sizeId: string; missing: number }[];
};
export type CutMode = 'LINEAR' | 'ANY';

/** Upper bound of pieces in one plan: the planner is synchronous, so unbounded input would freeze the API for everyone. */
export const MAX_PIECES_PER_PLAN = 5000;

const isPosInt = (n: number): boolean => Number.isInteger(n) && n > 0;

/** Throws RangeError for input the engine cannot reason about. Zero quantities are allowed (ignored). */
export function validateInput(sources: Source[], requests: Request[], minRemnantSideCm: number): void {
  if (!Number.isInteger(minRemnantSideCm) || minRemnantSideCm < 0) throw new RangeError('minRemnantSideCm must be a non-negative integer');
  for (const s of sources) {
    if (!isPosInt(s.widthCm) || !isPosInt(s.lengthCm)) throw new RangeError(`source ${s.id}: sizes must be positive integers`);
  }
  for (const r of requests) {
    if (!isPosInt(r.widthCm) || !isPosInt(r.lengthCm)) throw new RangeError(`request ${r.sizeId}: sizes must be positive integers`);
    if (!Number.isInteger(r.qty) || r.qty < 0) throw new RangeError(`request ${r.sizeId}: qty must be a non-negative integer`);
  }
  if (requests.reduce((a, r) => a + r.qty, 0) > MAX_PIECES_PER_PLAN) throw new RangeError(`at most ${MAX_PIECES_PER_PLAN} pieces per plan`);
}

/** Remnants are used before rolls (to avoid piling up offcuts); smaller first; ties by id for determinism. */
export function orderSources(sources: Source[]): Source[] {
  const rank = (s: Source): number => (s.kind === 'REMNANT' ? 0 : 1);
  return [...sources].sort((a, b) => rank(a) - rank(b) || a.widthCm * a.lengthCm - b.widthCm * b.lengthCm || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
