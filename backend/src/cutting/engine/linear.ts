import { CutPlan, Placement, RemnantOut, Request, Source, orderSources, validateInput } from './types';

type Demand = { req: Request; left: number };

/**
 * LINEAR mode: no rotation. A carpet's width lies across the source and its length along it.
 * The source is cut into full-width strips; one strip holds carpets of the same length whose widths fit side by side.
 */
export function planLinear(sources: Source[], requests: Request[], minRemnantSideCm: number): CutPlan {
  validateInput(sources, requests, minRemnantSideCm);
  const demand: Demand[] = requests.filter((r) => r.qty > 0).map((req) => ({ req, left: req.qty }));
  const placements: Placement[] = [];
  const remnants: RemnantOut[] = [];
  const big = (w: number, l: number): boolean => w >= minRemnantSideCm && l >= minRemnantSideCm;

  for (const src of orderSources(sources)) {
    if (demand.every((d) => d.left === 0)) break;
    let y = 0;
    let remaining = src.lengthCm;
    let used = false;
    const gaps: RemnantOut[] = [];

    for (;;) {
      const open = demand.filter((d) => d.left > 0 && d.req.lengthCm <= remaining && d.req.widthCm <= src.widthCm);
      if (open.length === 0) break;
      const stripLen = Math.max(...open.map((d) => d.req.lengthCm));
      const items = open
        .filter((d) => d.req.lengthCm === stripLen)
        .sort((a, b) => b.req.widthCm - a.req.widthCm || (a.req.sizeId < b.req.sizeId ? -1 : 1));
      let x = 0;
      for (const d of items) {
        while (d.left > 0 && x + d.req.widthCm <= src.widthCm) {
          placements.push({ sourceId: src.id, sizeId: d.req.sizeId, xCm: x, yCm: y, widthCm: d.req.widthCm, lengthCm: stripLen });
          x += d.req.widthCm;
          d.left -= 1;
        }
      }
      const gap = src.widthCm - x;
      if (gap > 0 && big(gap, stripLen)) gaps.push({ sourceId: src.id, widthCm: gap, lengthCm: stripLen });
      y += stripLen;
      remaining -= stripLen;
      used = true;
    }

    if (used) {
      remnants.push(...gaps);
      if (remaining > 0 && big(src.widthCm, remaining)) remnants.push({ sourceId: src.id, widthCm: src.widthCm, lengthCm: remaining });
    }
  }

  const shortfall = demand.filter((d) => d.left > 0).map((d) => ({ sizeId: d.req.sizeId, missing: d.left }));
  return { feasible: shortfall.length === 0, placements, remnants, shortfall };
}
