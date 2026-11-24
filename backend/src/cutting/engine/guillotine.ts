import { CutPlan, Placement, RemnantOut, Request, Source, orderSources, validateInput } from './types';

type Rect = { x: number; y: number; w: number; h: number };
type Piece = { sizeId: string; w: number; l: number };

/**
 * ANY mode: carpets may be rotated 90°. Every placement splits the free rectangle with a straight cut
 * (guillotine), so the space that is left is always a set of disjoint rectangles and can be stored as remnants.
 */
export function planAny(sources: Source[], requests: Request[], minRemnantSideCm: number): CutPlan {
  validateInput(sources, requests, minRemnantSideCm);
  let pending: Piece[] = requests
    .flatMap((r) => Array.from({ length: r.qty }, () => ({ sizeId: r.sizeId, w: r.widthCm, l: r.lengthCm })))
    .sort((a, b) => b.w * b.l - a.w * a.l || (a.sizeId < b.sizeId ? -1 : a.sizeId > b.sizeId ? 1 : 0));
  const placements: Placement[] = [];
  const remnants: RemnantOut[] = [];

  for (const src of orderSources(sources)) {
    if (pending.length === 0) break;
    let free: Rect[] = [{ x: 0, y: 0, w: src.widthCm, h: src.lengthCm }];
    const unplaced: Piece[] = [];
    let used = false;

    for (const piece of pending) {
      let best: { idx: number; w: number; h: number; score: [number, number, number, number, number] } | null = null;
      free.forEach((fr, idx) => {
        const orientations: [number, number, number][] = [[piece.w, piece.l, 0]];
        if (piece.w !== piece.l) orientations.push([piece.l, piece.w, 1]);
        for (const [w, h, rotated] of orientations) {
          if (w > fr.w || h > fr.h) continue;
          const leftoverW = fr.w - w;
          const leftoverH = fr.h - h;
          const score: [number, number, number, number, number] = [Math.min(leftoverW, leftoverH), Math.max(leftoverW, leftoverH), fr.y, fr.x, rotated];
          if (!best || less(score, best.score)) best = { idx, w, h, score };
        }
      });
      if (!best) { unplaced.push(piece); continue; }
      const { idx, w, h } = best as { idx: number; w: number; h: number };
      const fr = free[idx];
      placements.push({ sourceId: src.id, sizeId: piece.sizeId, xCm: fr.x, yCm: fr.y, widthCm: w, lengthCm: h });
      used = true;
      const rightW = fr.w - w;
      const bottomH = fr.h - h;
      const pieces: Rect[] =
        rightW < bottomH
          ? [{ x: fr.x + w, y: fr.y, w: rightW, h }, { x: fr.x, y: fr.y + h, w: fr.w, h: bottomH }]
          : [{ x: fr.x + w, y: fr.y, w: rightW, h: fr.h }, { x: fr.x, y: fr.y + h, w, h: bottomH }];
      free = [...free.slice(0, idx), ...pieces.filter((r) => r.w > 0 && r.h > 0), ...free.slice(idx + 1)];
    }

    if (used) {
      for (const fr of free) {
        if (fr.w >= minRemnantSideCm && fr.h >= minRemnantSideCm) remnants.push({ sourceId: src.id, widthCm: fr.w, lengthCm: fr.h, xCm: fr.x, yCm: fr.y });
      }
    }
    pending = unplaced;
  }

  const missing = new Map<string, number>();
  pending.forEach((p) => missing.set(p.sizeId, (missing.get(p.sizeId) ?? 0) + 1));
  const shortfall = requests.filter((r) => missing.has(r.sizeId)).map((r) => ({ sizeId: r.sizeId, missing: missing.get(r.sizeId)! }));
  return { feasible: shortfall.length === 0, placements, remnants, shortfall };
}

function less(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
