import { useId } from 'react';

export type PlanPlacement = { sourceId: string; sizeId: string; xCm: number; yCm: number; widthCm: number; lengthCm: number };
export type PlanRemnant = { sourceId: string; widthCm: number; lengthCm: number; xCm: number; yCm: number };
export type CutPlanData = { feasible: boolean; placements: PlanPlacement[]; remnants: PlanRemnant[]; shortfall: { sizeId: string; missing: number }[] };

const K = 0.4; // 1 cm = 0.4 drawing units: a 2500 cm roll is 1000 units long
const TOP = 14;

interface Props {
  plan: CutPlanData;
  rollWidthCm: number;
  rollLengthCm: number;
  /** Human labels per size id, e.g. { id: '150×200' }; defaults to width×length. */
  sizeLabels?: Record<string, string>;
  /** Real dimensions of each source (a remnant used as a source is shorter than a roll). */
  sources?: Record<string, { widthCm: number; lengthCm: number }>;
}

/** The roll lies horizontally: its length runs left to right, its width top to bottom (as in the approved mockup). */
export function CutPlanSvg({ plan, rollWidthCm, rollLengthCm, sizeLabels = {}, sources = {} }: Props) {
  const uid = useId();
  const ids = [...new Set([...plan.placements.map((p) => p.sourceId), ...plan.remnants.map((r) => r.sourceId)])];
  const sizeIds = [...new Set(plan.placements.map((p) => p.sizeId))];
  const cls = (sizeId: string): string => `s${(sizeIds.indexOf(sizeId) % 3) + 1}`;

  return (
    <div className="plan-scroll">
      {ids.map((id, n) => {
        const dims = sources[id] ?? { widthCm: rollWidthCm, lengthCm: rollLengthCm };
        const w = dims.lengthCm * K; const h = dims.widthCm * K;
        const hatch = `${uid}-h${n}`;
        return (
          <div className="cutplan" key={id}>
            <svg viewBox={`0 0 ${w} ${TOP + h + 22}`} role="img" aria-label={`Схема раскроя рулона ${dims.widthCm} на ${dims.lengthCm} см`}>
              <defs>
                <pattern id={hatch} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="var(--accent)" strokeWidth="2.5" opacity=".7" />
                </pattern>
              </defs>
              {plan.placements.filter((p) => p.sourceId === id).map((p, i) => (
                <g key={`p${i}`}>
                  <rect className={`piece ${cls(p.sizeId)}`} x={p.yCm * K} y={TOP + p.xCm * K} width={p.lengthCm * K} height={p.widthCm * K} />
                  <text className={cls(p.sizeId) === 's3' ? 't3' : ''} x={(p.yCm + p.lengthCm / 2) * K} y={TOP + (p.xCm + p.widthCm / 2) * K}>
                    {sizeLabels[p.sizeId] ?? `${p.widthCm}×${p.lengthCm}`}
                  </text>
                </g>
              ))}
              {plan.remnants.filter((r) => r.sourceId === id).map((r, i) => (
                <g key={`r${i}`}>
                  <rect className="piece rem" fill={`url(#${hatch})`} x={r.yCm * K} y={TOP + r.xCm * K} width={r.lengthCm * K} height={r.widthCm * K} />
                  <text className="rt" x={(r.yCm + r.lengthCm / 2) * K} y={TOP + (r.xCm + r.widthCm / 2) * K}>
                    {r.lengthCm * K >= 60 ? `обрезок ${r.widthCm}×${r.lengthCm}` : ''}
                  </text>
                </g>
              ))}
              <text className="scale" x="0" y={TOP + h + 16} style={{ textAnchor: 'start' }}>0</text>
              <text className="scale" x={w} y={TOP + h + 16} style={{ textAnchor: 'end' }}>{dims.lengthCm} см</text>
              <text className="scale" x="0" y="6" style={{ textAnchor: 'start' }}>{dims.widthCm} см</text>
            </svg>
          </div>
        );
      })}
    </div>
  );
}
