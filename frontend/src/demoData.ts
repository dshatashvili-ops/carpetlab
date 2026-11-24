import { CutPlanData, PlanPlacement } from './components/CutPlanSvg';

/** Fictional data for the public demo: one 150×2500 roll of article 109029. */
const pieces: [string, number, number][] = [['a', 300, 4], ['b', 200, 4], ['c', 150, 2]];
const placements: PlanPlacement[] = [];
let y = 0;
for (const [sizeId, lengthCm, qty] of pieces) {
  for (let i = 0; i < qty; i++) { placements.push({ sourceId: 'demo#0', sizeId, xCm: 0, yCm: y, widthCm: 150, lengthCm }); y += lengthCm; }
}

export const demoPlan: CutPlanData = {
  feasible: true,
  shortfall: [],
  placements,
  remnants: [{ sourceId: 'demo#0', widthCm: 150, lengthCm: 200, xCm: 0, yCm: y }],
};
export const demoSizeLabels = { a: '150×300', b: '150×200', c: '150×150' };
export const demoStock = [
  { kind: 'Рулон', size: '150 × 2500', qty: 1, area: '37,5 м²' },
  { kind: 'Обрезок', size: '150 × 800', qty: 2, area: '24,0 м²' },
];
export const demoCarpets = [
  { size: '150 × 300', qty: 12 }, { size: '150 × 200', qty: 9 }, { size: '150 × 150', qty: 4 },
];
