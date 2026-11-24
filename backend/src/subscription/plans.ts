export type PlanId = 1 | 2 | 3;
export interface PlanLimits { articles: number; employees: number; photoBytes: number }

const MB = 1024 * 1024;
export const PLANS: Record<PlanId, PlanLimits> = {
  1: { articles: 10, employees: 3, photoBytes: 100 * MB },
  2: { articles: 100, employees: 10, photoBytes: 1024 * MB },
  3: { articles: 500, employees: 20, photoBytes: 5 * 1024 * MB },
};

export const limitsFor = (plan: number): PlanLimits => PLANS[(plan in PLANS ? plan : 1) as PlanId];
