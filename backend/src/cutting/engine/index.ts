import { planAny } from './guillotine';
import { planLinear } from './linear';
import { CutMode, CutPlan, Request, Source } from './types';

export * from './types';
export { planLinear } from './linear';
export { planAny } from './guillotine';

/** Single entry point: chooses the algorithm by the article's cut mode. */
export function plan(mode: CutMode, sources: Source[], requests: Request[], minRemnantSideCm: number): CutPlan {
  return mode === 'LINEAR' ? planLinear(sources, requests, minRemnantSideCm) : planAny(sources, requests, minRemnantSideCm);
}

const MAX_PIECES = 2000;

/**
 * Proposes quantities so that counts never differ by more than 1: the size with the fewest pieces gets the next one
 * (bigger carpets first on ties); it stops when none of the smallest-count sizes fits. Sizes that cannot be cut even once get 0.
 */
export function suggestQuantities(
  sources: Source[],
  sizes: Omit<Request, 'qty'>[],
  mode: CutMode,
  minRemnantSideCm: number,
): Request[] {
  const reqs: Request[] = sizes.map((s) => ({ ...s, qty: 0 }));
  const fits = (): boolean => plan(mode, sources, reqs, minRemnantSideCm).feasible;
  const active = reqs.filter((r) => {
    r.qty = 1;
    const ok = fits();
    r.qty = 0;
    return ok;
  });

  for (let total = 0; total < MAX_PIECES; total++) {
    const lowest = Math.min(...active.map((r) => r.qty));
    const candidates = active
      .filter((r) => r.qty === lowest)
      .sort((a, b) => b.widthCm * b.lengthCm - a.widthCm * a.lengthCm || (a.sizeId < b.sizeId ? -1 : 1));
    let added = false;
    for (const c of candidates) {
      c.qty += 1;
      if (fits()) { added = true; break; }
      c.qty -= 1;
    }
    if (!added) break;
  }
  return reqs;
}
