/* eslint-disable @typescript-eslint/no-explicit-any */
// Demo only: an in-memory stand-in for the backend so the real UI can be clicked through without a server.
// Cutting uses the real engine from the backend package; everything else mirrors the API's behaviour in simplified form.
import { formatEan13 } from '../../../backend/src/barcodes/ean13';
import { plan as runPlan, suggestQuantities } from '../../../backend/src/cutting/engine';

const uid = (): string => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(16).slice(2)}-${Date.now()}`);
const DAY = 86_400_000;
class HttpError extends Error { constructor(public status: number, message: string, public code?: string, public extra: any = {}) { super(message); } }
const bad = (m: string): never => { throw new HttpError(400, m); };

const OWNER_EMAIL = 'owner@carpets.example';
const db: any = {
  loggedIn: false, role: 'OWNER', email: OWNER_EMAIL, org: 'Ковры+', userId: uid(), orgId: uid(),
  settings: { gsPrefix: '4600123', minRemnantSideCm: 30, labelWidthMm: 58, labelHeightMm: 40 },
  articles: [] as any[], sizes: [] as any[], materials: [] as any[], skus: [] as any[], moves: [] as any[], docs: [] as any[], versions: [] as any[],
  docCounter: 1, eanSeq: 1,
  members: [] as any[], invites: [] as any[],
};
const PRICES: Record<number, number[]> = { 1: [150_000, 400_000, 750_000, 1_400_000], 2: [450_000, 1_200_000, 2_300_000, 4_300_000], 3: [1_200_000, 3_300_000, 6_300_000, 11_900_000] };
const MONTHS = [1, 3, 6, 12];
const priceList = (): any[] => [1, 2, 3].flatMap((plan) => MONTHS.map((months, i) => ({ plan, months, priceKopecks: PRICES[plan][i] })));

// ---------- helpers ----------
const move = (itemId: string, kind: string, qtyDelta: number, reason: string | null = null): void => {
  db.moves.push({ id: uid(), itemId, kind, qtyDelta, reason, userEmail: db.email, createdAt: new Date().toISOString() });
};
const article = (id: string): any => db.articles.find((a: any) => a.id === id) ?? ((): never => { throw new HttpError(404, 'Артикул не найден'); })();
const sizeOf = (id: string): any => db.sizes.find((s: any) => s.id === id) ?? ((): never => { throw new HttpError(404, 'Размер не найден'); })();
const area = (cm2: number): number => Math.round(cm2) / 10_000;
const matView = (m: any): any => ({ id: m.id, articleId: m.articleId, kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm, qty: m.qty, areaM2: Math.round((m.qty * m.widthCm * m.lengthCm) / 1) / 10_000 });

function findOrCreateMaterial(articleId: string, kind: string, widthCm: number, lengthCm: number): any {
  let m = db.materials.find((x: any) => x.articleId === articleId && x.kind === kind && x.widthCm === widthCm && x.lengthCm === lengthCm);
  if (!m) { m = { id: uid(), articleId, kind, widthCm, lengthCm, qty: 0 }; db.materials.push(m); }
  return m;
}
function ensureSku(articleId: string, sizeId: string): any {
  let s = db.skus.find((x: any) => x.articleId === articleId && x.sizeId === sizeId);
  if (!s) {
    s = { id: uid(), articleId, sizeId, ean13: null, qty: 0 };
    if (article(articleId).barcodeEnabled && db.settings.gsPrefix) s.ean13 = formatEan13(db.settings.gsPrefix, db.eanSeq++);
    db.skus.push(s);
  }
  return s;
}
const addSize = (w: number, l: number): any => { const s = { id: uid(), widthCm: w, lengthCm: l }; db.sizes.push(s); return s; };

// ---------- cutting ----------
function calculate(b: any): any {
  if (!b?.articleId) bad('Укажите артикул');
  if (!Array.isArray(b.sizeIds) || b.sizeIds.length === 0) bad('Выберите хотя бы один размер');
  const unique: string[] = [...new Set<string>(b.sizeIds)];
  if (b.quantities !== undefined) for (const q of b.quantities) {
    if (!Number.isInteger(q?.qty) || q.qty < 0) bad('Количество должно быть целым числом не меньше 0');
    if (!unique.includes(q.sizeId)) bad('Количество задано для размера, который не выбран');
  }
  const art = article(b.articleId); const sizes = unique.map(sizeOf);
  const mats = db.materials.filter((m: any) => m.articleId === art.id && m.qty > 0);
  const sources = mats.flatMap((m: any) => Array.from({ length: m.qty }, (_, n) => ({ id: `${m.id}#${n}`, kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm })));
  const base = sizes.map((s: any) => ({ sizeId: s.id, widthCm: s.widthCm, lengthCm: s.lengthCm }));
  const min = db.settings.minRemnantSideCm;
  let requests: any[];
  try {
    requests = b.quantities === undefined
      ? suggestQuantities(sources, base, art.cutMode, min)
      : base.map((x: any) => ({ ...x, qty: b.quantities.find((q: any) => q.sizeId === x.sizeId)?.qty ?? 0 }));
    const result = runPlan(art.cutMode, sources, requests, min);
    const touched = new Set(result.placements.map((p: any) => p.sourceId));
    const src = sources.filter((s: any) => touched.has(s.id)).reduce((a: number, s: any) => a + s.widthCm * s.lengthCm, 0);
    const used = result.placements.reduce((a: number, p: any) => a + p.widthCm * p.lengthCm, 0);
    const rem = result.remnants.reduce((a: number, r: any) => a + r.widthCm * r.lengthCm, 0);
    return { cutMode: art.cutMode, stock: { materials: mats.map(matView) }, requests, plan: result, sourceAreaM2: area(src), usedAreaM2: area(used), remnantAreaM2: area(rem), wasteAreaM2: area(src - used - rem) };
  } catch (e) { if (e instanceof RangeError) return bad(e.message); throw e; }
}

const stateEffects = (state: any, sign: number): void => {
  for (const c of state.consumed) { const m = db.materials.find((x: any) => x.id === c.materialId); m.qty -= c.qty * sign; if (c.qty) move(m.id, sign > 0 ? 'CUT_CONSUME' : 'EDIT_REVERSAL', -c.qty * sign); }
  for (const r of state.remnants) { const m = db.materials.find((x: any) => x.id === r.materialId); m.qty += r.qty * sign; if (r.qty) move(m.id, sign > 0 ? 'RECEIPT' : 'EDIT_REVERSAL', r.qty * sign); }
  for (const o of state.outputs) { const s = db.skus.find((x: any) => x.id === o.skuId); s.qty += o.qty * sign; if (o.qty) move(s.id, sign > 0 ? 'CUT_OUTPUT' : 'EDIT_REVERSAL', o.qty * sign); }
};
const docState = (d: any): any => (d.version > 1 ? db.versions.filter((v: any) => v.documentId === d.id).sort((a: any, b: any) => b.version - a.version)[0].snapshot.after : d.state);

function execute(b: any): any {
  const calc = calculate(b);
  if (calc.requests.every((r: any) => r.qty === 0)) bad('Нечего резать: все количества равны 0');
  if (!calc.plan.feasible) throw new HttpError(409, 'Материала не хватает', 'CUT_INFEASIBLE', { shortfall: calc.plan.shortfall });
  const art = article(b.articleId);
  const lineQty = new Map<string, number>(); const units = new Map<string, Set<string>>(); const bySize = new Map<string, number>();
  for (const p of calc.plan.placements) {
    const mid = p.sourceId.split('#')[0];
    lineQty.set(`${mid}|${p.sizeId}`, (lineQty.get(`${mid}|${p.sizeId}`) ?? 0) + 1);
    if (!units.has(mid)) units.set(mid, new Set());
    units.get(mid)!.add(p.sourceId);
    bySize.set(p.sizeId, (bySize.get(p.sizeId) ?? 0) + 1);
  }
  const remCount = new Map<string, number>();
  for (const r of calc.plan.remnants) remCount.set(`${r.widthCm}x${r.lengthCm}`, (remCount.get(`${r.widthCm}x${r.lengthCm}`) ?? 0) + 1);
  const state = {
    lines: [...lineQty].map(([k, qty]) => { const [sourceMaterialId, sizeId] = k.split('|'); return { sourceMaterialId, sizeId, qty }; }),
    consumed: [...units].map(([materialId, u]) => ({ materialId, qty: u.size })),
    remnants: [...remCount].map(([k, qty]) => { const [w, l] = k.split('x').map(Number); return { materialId: findOrCreateMaterial(art.id, 'REMNANT', w, l).id, widthCm: w, lengthCm: l, qty }; }),
    outputs: [...bySize].map(([sizeId, qty]) => { const sz = sizeOf(sizeId); return { skuId: ensureSku(art.id, sizeId).id, sizeId, widthCm: sz.widthCm, lengthCm: sz.lengthCm, qty }; }),
  };
  const doc = { id: uid(), number: db.docCounter++, articleId: art.id, status: 'DONE', version: 1, createdAt: new Date().toISOString(), state };
  db.docs.push(doc);
  stateEffects(state, 1);
  return { id: doc.id, number: doc.number, version: 1, status: 'DONE', articleId: art.id };
}

function docDetail(d: any): any {
  const art = article(d.articleId); const st = docState(d);
  const mat = (id: string): any => db.materials.find((m: any) => m.id === id);
  return {
    id: d.id, number: d.number, status: d.status, version: d.version, articleId: d.articleId, articleCode: art.code, articleName: art.name, createdAt: d.createdAt,
    lines: st.lines.map((l: any) => { const s = mat(l.sourceMaterialId); const z = sizeOf(l.sizeId); return { sourceMaterialId: l.sourceMaterialId, sourceKind: s.kind, sourceWidthCm: s.widthCm, sourceLengthCm: s.lengthCm, sizeId: l.sizeId, sizeWidthCm: z.widthCm, sizeLengthCm: z.lengthCm, qty: l.qty }; }),
    outputs: st.outputs.map((o: any) => ({ skuId: o.skuId, ean13: db.skus.find((s: any) => s.id === o.skuId)?.ean13 ?? null, widthCm: o.widthCm, lengthCm: o.lengthCm, qty: o.qty })),
    remnants: st.remnants.map((r: any) => ({ materialId: r.materialId, widthCm: r.widthCm, lengthCm: r.lengthCm, qty: r.qty })),
  };
}

function editDoc(id: string, b: any): any {
  const d = db.docs.find((x: any) => x.id === id); if (!d) throw new HttpError(404, 'Документ не найден');
  const reason = (b?.reason ?? '').trim();
  if (!reason) bad('Укажите причину правки');
  if (!Array.isArray(b.lines)) bad('Передайте строки документа (lines)');
  for (const l of b.lines) if (!Number.isInteger(l?.qty) || l.qty < 0) bad('Количество в строке — целое число не меньше 0');
  const before = docState(d);
  const lines = b.lines.filter((l: any) => l.qty > 0).map((l: any) => ({ sourceMaterialId: l.sourceMaterialId, sizeId: l.sizeId, qty: l.qty }));
  const perSize = new Map<string, number>(); lines.forEach((l: any) => perSize.set(l.sizeId, (perSize.get(l.sizeId) ?? 0) + l.qty));
  const outputs = [...perSize].map(([sizeId, qty]) => { const sz = sizeOf(sizeId); return { skuId: ensureSku(d.articleId, sizeId).id, sizeId, widthCm: sz.widthCm, lengthCm: sz.lengthCm, qty }; });
  const remnants = b.remnants
    ? b.remnants.filter((r: any) => r.qty > 0).map((r: any) => ({ materialId: findOrCreateMaterial(d.articleId, 'REMNANT', r.widthCm, r.lengthCm).id, widthCm: r.widthCm, lengthCm: r.lengthCm, qty: r.qty }))
    : before.remnants;
  const after = { lines, consumed: b.consumed ?? before.consumed, remnants, outputs };
  stateEffects(before, -1); stateEffects(after, 1);
  d.version += 1;
  db.versions.push({ documentId: id, version: d.version, reason, createdAt: new Date().toISOString(), editedByEmail: db.email, snapshot: { before, after } });
  const touchedMats = new Set<string>([...before.consumed, ...after.consumed, ...before.remnants, ...after.remnants].map((x: any) => x.materialId));
  const warnings: any[] = [];
  for (const mid of touchedMats) {
    const m = db.materials.find((x: any) => x.id === mid);
    if (m.qty < 0) warnings.push({ itemType: 'MATERIAL', materialId: mid, balance: m.qty, laterDocumentIds: db.docs.filter((o: any) => o.number > d.number && [...docState(o).consumed, ...docState(o).remnants].some((x: any) => x.materialId === mid)).map((o: any) => o.id) });
  }
  return { id, number: d.number, version: d.version, status: d.status, articleId: d.articleId, warnings };
}

// ---------- seed ----------
function seed(): void {
  db.members.push({ id: uid(), userId: db.userId, email: OWNER_EMAIL, role: 'OWNER' }, { id: uid(), userId: uid(), email: 'operator@carpets.example', role: 'OPERATOR' });
  const a1 = { id: uid(), code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: true };
  const a2 = { id: uid(), code: '205010', name: 'Берберская', rollWidthCm: 200, cutMode: 'ANY', barcodeEnabled: false };
  db.articles.push(a1, a2);
  const s150 = addSize(150, 150), s200 = addSize(150, 200), s300 = addSize(150, 300); addSize(100, 150); addSize(200, 300);
  findOrCreateMaterial(a1.id, 'ROLL', 150, 2500).qty = 3;
  findOrCreateMaterial(a1.id, 'REMNANT', 150, 800).qty = 1;
  findOrCreateMaterial(a2.id, 'ROLL', 200, 3000).qty = 1;
  void s150;
  execute({ articleId: a1.id, sizeIds: [s200.id, s300.id], quantities: [{ sizeId: s200.id, qty: 5 }, { sizeId: s300.id, qty: 3 }] });
  db.moves.length = 0; // keep the history list short for the first impression
}
seed();

// ---------- router ----------
type Handler = (m: RegExpMatchArray, body: any, q: URLSearchParams) => any;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, path: RegExp, h: Handler): void => { routes.push([method, path, h]); };
const need = (): void => { if (!db.loggedIn) throw new HttpError(401, 'Требуется вход'); };
const subscription = (): any => ({ status: 'TRIAL', plan: 1, expiresAt: new Date(Date.now() + 7 * DAY).toISOString(), daysLeft: 7, noticeBanner: null });

on('GET', /^\/api\/auth\/me$/, () => { need(); return { userId: db.userId, orgId: db.orgId, role: db.role, emailVerified: true, isServiceAdmin: false }; });
on('POST', /^\/api\/auth\/(login|register|accept-invite)$/, (_m, b) => { if (b?.email) db.email = b.email; db.loggedIn = true; return { ok: true }; });
on('POST', /^\/api\/auth\/logout$/, () => { db.loggedIn = false; return undefined; });
on('GET', /^\/api\/subscription$/, () => { need(); return subscription(); });
on('GET', /^\/api\/public\/prices$/, () => ({ plans: [{ plan: 1, articles: 10, employees: 3, photoMb: 100 }, { plan: 2, articles: 100, employees: 10, photoMb: 1024 }, { plan: 3, articles: 500, employees: 20, photoMb: 5120 }].map((p) => ({ ...p, prices: priceList().filter((x) => x.plan === p.plan).map(({ months, priceKopecks }) => ({ months, priceKopecks })) })) }));
on('GET', /^\/api\/billing\/prices$/, () => { need(); return priceList(); });
on('POST', /^\/api\/billing\/checkout$/, (_m, b) => {
  need();
  const price = priceList().find((p) => p.plan === b.plan && p.months === b.months); if (!price) bad('Цена не задана');
  return { paymentId: uid(), invoice: { amountKopecks: price.priceKopecks, description: `CarpetLAB, тариф ${b.plan}, ${b.months} мес.`, payer: db.org } };
});

on('GET', /^\/api\/articles$/, (_m, _b, q) => {
  need(); const s = (q.get('q') ?? '').toLowerCase(); const stock = q.get('stock');
  const inStock = new Set(db.materials.filter((m: any) => m.qty > 0).map((m: any) => m.articleId));
  return db.articles.filter((a: any) => !s || a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s))
    .filter((a: any) => (stock === 'inStock' ? inStock.has(a.id) : stock === 'empty' ? !inStock.has(a.id) : true));
});
const checkArticle = (b: any, id?: string): any => {
  const code = (b.code ?? '').trim(), name = (b.name ?? '').trim();
  if (!code) bad('Укажите артикул'); if (!name) bad('Укажите название');
  if (!Number.isInteger(b.rollWidthCm) || b.rollWidthCm <= 0) bad('Ширина рулона должна быть целым числом сантиметров больше 0');
  if (b.cutMode !== 'LINEAR' && b.cutMode !== 'ANY') bad('Режим резки: LINEAR или ANY');
  if (db.articles.some((a: any) => a.code === code && a.id !== id)) throw new HttpError(409, 'Артикул с таким кодом уже есть');
  return { code, name, rollWidthCm: b.rollWidthCm, cutMode: b.cutMode, barcodeEnabled: !!b.barcodeEnabled };
};
on('POST', /^\/api\/articles$/, (_m, b) => {
  need(); const data = checkArticle(b);
  if (db.articles.length >= 10) throw new HttpError(409, 'Лимит артикулов тарифа: 10', 'LIMIT_REACHED');
  const a = { id: uid(), ...data }; db.articles.push(a); return a;
});
on('PATCH', /^\/api\/articles\/([^/]+)$/, (m, b) => { need(); const a = article(m[1]); Object.assign(a, checkArticle({ ...a, ...b }, a.id)); return a; });
on('POST', /^\/api\/articles\/([^/]+)\/photo$/, (m) => article(m[1]));

on('GET', /^\/api\/sizes$/, () => { need(); return [...db.sizes].sort((a: any, b: any) => a.widthCm - b.widthCm || a.lengthCm - b.lengthCm); });
on('POST', /^\/api\/sizes$/, (_m, b) => {
  need();
  if (!Number.isInteger(b.widthCm) || !Number.isInteger(b.lengthCm) || b.widthCm <= 0 || b.lengthCm <= 0) bad('Размеры должны быть целыми числами сантиметров больше 0');
  if (db.sizes.some((s: any) => s.widthCm === b.widthCm && s.lengthCm === b.lengthCm)) throw new HttpError(409, 'Такой размер уже есть');
  return addSize(b.widthCm, b.lengthCm);
});
on('DELETE', /^\/api\/sizes\/([^/]+)$/, (m) => {
  if (db.skus.some((s: any) => s.sizeId === m[1])) throw new HttpError(409, 'Размер используется в готовых коврах или документах раскроя');
  db.sizes = db.sizes.filter((s: any) => s.id !== m[1]); return undefined;
});

on('GET', /^\/api\/stock\/materials$/, (_m, _b, q) => { need(); const aid = q.get('articleId'); return db.materials.filter((m: any) => (!aid || m.articleId === aid) && m.qty !== 0).map(matView); });
on('GET', /^\/api\/stock\/carpets$/, (_m, _b, q) => {
  need(); const aid = q.get('articleId'), s = (q.get('q') ?? '').toLowerCase(), ean = q.get('ean');
  return db.skus.filter((k: any) => k.qty !== 0 && (!aid || k.articleId === aid) && (!ean || k.ean13 === ean)).map((k: any) => {
    const a = article(k.articleId), z = sizeOf(k.sizeId);
    return { skuId: k.id, articleId: a.id, articleCode: a.code, articleName: a.name, sizeId: z.id, widthCm: z.widthCm, lengthCm: z.lengthCm, ean13: k.ean13, qty: k.qty };
  }).filter((r: any) => !s || r.articleCode.toLowerCase().includes(s) || r.articleName.toLowerCase().includes(s));
});
on('POST', /^\/api\/stock\/rolls$/, (_m, b) => {
  need(); const a = article(b.articleId);
  const pos = (n: any): boolean => Number.isInteger(n) && n > 0;
  if (!pos(b.widthCm) || !pos(b.lengthCm)) bad('Ширина и длина — целые сантиметры больше 0');
  if (!pos(b.count)) bad('Количество рулонов — целое число больше 0');
  if (a.rollWidthCm !== b.widthCm) bad(`Ширина рулона этого артикула — ${a.rollWidthCm} см`);
  const m = findOrCreateMaterial(a.id, 'ROLL', b.widthCm, b.lengthCm); m.qty += b.count; move(m.id, 'RECEIPT', b.count);
  return { materialId: m.id };
});
on('POST', /^\/api\/stock\/adjust$/, (_m, b) => {
  need(); const reason = (b.reason ?? '').trim();
  if (!reason) bad('Укажите причину'); if (!Number.isInteger(b.qtyDelta) || b.qtyDelta === 0) bad('Изменение должно быть целым числом, не равным 0');
  const item = b.itemType === 'MATERIAL' ? db.materials.find((m: any) => m.id === b.id) : db.skus.find((s: any) => s.id === b.id);
  if (!item) throw new HttpError(404, 'Позиция не найдена');
  if (item.qty + b.qtyDelta < 0) throw new HttpError(409, `Недостаточно остатка: на складе ${item.qty}`);
  item.qty += b.qtyDelta; move(item.id, b.qtyDelta < 0 ? 'MANUAL_WRITE_OFF' : 'MANUAL_RECEIPT', b.qtyDelta, reason);
  return { balance: item.qty };
});
on('GET', /^\/api\/stock\/history$/, (_m, _b, q) => db.moves.filter((x: any) => x.itemId === q.get('itemId')));
on('GET', /^\/api\/stock\/problems$/, () => [
  ...db.materials.filter((m: any) => m.qty < 0).map((m: any) => ({ itemType: 'MATERIAL', materialId: m.id, kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm, balance: m.qty, documentIds: db.docs.filter((d: any) => [...docState(d).consumed, ...docState(d).remnants].some((x: any) => x.materialId === m.id)).map((d: any) => d.id) })),
  ...db.skus.filter((k: any) => k.qty < 0).map((k: any) => ({ itemType: 'CARPET', skuId: k.id, widthCm: sizeOf(k.sizeId).widthCm, lengthCm: sizeOf(k.sizeId).lengthCm, balance: k.qty, documentIds: [] })),
]);

on('POST', /^\/api\/cuts\/calculate$/, (_m, b) => { need(); return calculate(b); });
on('POST', /^\/api\/cuts$/, (_m, b) => { need(); return execute(b); });
on('GET', /^\/api\/cuts$/, () => { need(); return [...db.docs].sort((a: any, b: any) => b.number - a.number).map((d: any) => ({ id: d.id, number: d.number, articleCode: article(d.articleId).code, articleName: article(d.articleId).name, version: d.version, createdAt: d.createdAt, createdByEmail: db.email })); });
on('GET', /^\/api\/cuts\/([^/]+)$/, (m) => { const d = db.docs.find((x: any) => x.id === m[1]); if (!d) throw new HttpError(404, 'Документ не найден'); return docDetail(d); });
on('PATCH', /^\/api\/cuts\/([^/]+)$/, (m, b) => editDoc(m[1], b));
on('GET', /^\/api\/cuts\/([^/]+)\/history$/, (m) => db.versions.filter((v: any) => v.documentId === m[1]));

on('GET', /^\/api\/employees$/, () => ({ members: db.members, pendingInvites: db.invites }));
on('POST', /^\/api\/employees$/, (_m, b) => {
  const email = (b.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad('Некорректный e-mail');
  if (db.members.length + db.invites.length >= 3) throw new HttpError(409, 'Лимит сотрудников тарифа: 3', 'LIMIT_REACHED');
  db.invites.push({ email, role: b.role }); return { ok: true };
});
on('PATCH', /^\/api\/employees\/([^/]+)$/, (m, b) => {
  const e = db.members.find((x: any) => x.id === m[1]); if (!e) throw new HttpError(404, 'Не найден');
  if (e.role === 'OWNER' && b.role !== 'OWNER' && db.members.filter((x: any) => x.role === 'OWNER').length <= 1) throw new HttpError(409, 'Нельзя убрать последнего владельца');
  e.role = b.role; return { id: e.id, role: e.role };
});
on('DELETE', /^\/api\/employees\/([^/]+)$/, (m) => {
  const e = db.members.find((x: any) => x.id === m[1]);
  if (e?.role === 'OWNER' && db.members.filter((x: any) => x.role === 'OWNER').length <= 1) throw new HttpError(409, 'Нельзя убрать последнего владельца');
  db.members = db.members.filter((x: any) => x.id !== m[1]); return undefined;
});

const settingsView = (): any => ({ name: db.org, ...db.settings });
on('GET', /^\/api\/org\/settings$/, () => settingsView());
on('PATCH', /^\/api\/org\/settings$/, (_m, b) => {
  if (!Number.isInteger(b.minRemnantSideCm) || b.minRemnantSideCm < 0) bad('Порог обрезка — целое число сантиметров, не меньше 0');
  for (const k of ['labelWidthMm', 'labelHeightMm']) if (!Number.isInteger(b[k]) || b[k] <= 0) bad('Размер этикетки — целое число миллиметров больше 0');
  Object.assign(db.settings, { minRemnantSideCm: b.minRemnantSideCm, labelWidthMm: b.labelWidthMm, labelHeightMm: b.labelHeightMm }); return settingsView();
});
on('PUT', /^\/api\/org\/gs-prefix$/, (_m, b) => {
  if (!/^\d{7,9}$/.test(b.prefix ?? '')) bad('Префикс GS1 — от 7 до 9 цифр');
  if (db.settings.gsPrefix !== b.prefix && db.eanSeq > 1) throw new HttpError(409, 'Префикс нельзя менять после присвоения штрихкодов');
  db.settings.gsPrefix = b.prefix; return { gsPrefix: b.prefix };
});

export function installMockApi(): void {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://demo.local');
    const method = (init.method ?? 'GET').toUpperCase();
    let body: any;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = undefined; } }
    await new Promise((r) => setTimeout(r, 40));
    try {
      const route = routes.find(([m, re]) => m === method && re.test(url.pathname));
      if (!route) throw new HttpError(404, 'В демо этот запрос не поддерживается');
      const data = route[2](url.pathname.match(route[1])!, body, url.searchParams);
      return data === undefined ? new Response(null, { status: 204 }) : new Response(JSON.stringify(data), { status: method === 'POST' && !/login|logout|calculate|webhook/.test(url.pathname) ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (e instanceof HttpError) return new Response(JSON.stringify({ message: e.message, code: e.code, ...e.extra }), { status: e.status, headers: { 'Content-Type': 'application/json' } });
      throw e;
    }
  }) as typeof fetch;
}
