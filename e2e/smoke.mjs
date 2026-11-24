// Full-stack smoke: register → article → size → receive roll → cut → edit document → spec PDF.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Playwright is pre-installed globally in this environment; require() honours NODE_PATH, ESM import does not.
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const email = `smoke-${Date.now()}@example.com`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.setDefaultTimeout(8000);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

try {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: 'Раскрой рулонов без калькулятора' }).waitFor();
  await shot('01-home');

  await page.goto(`${BASE}/register`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Название организации').fill('Ковры Смоук');
  await page.getByLabel('Пароль').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Начать пробный период' }).click();
  await page.waitForURL('**/app');

  await page.goto(`${BASE}/app/articles`);
  await page.getByRole('button', { name: 'Новый артикул' }).click();
  await page.getByLabel('Артикул', { exact: true }).fill('109029');
  await page.getByLabel('Название', { exact: true }).fill('Сахара');
  await page.getByLabel('Ширина рулона, см').fill('150');
  await page.getByLabel('Режим резки').selectOption('LINEAR');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('cell', { name: '109029' }).waitFor();

  await page.goto(`${BASE}/app/sizes`);
  for (const l of ['200', '300']) {
    await page.getByLabel('Ширина, см').fill('150');
    await page.getByLabel('Длина, см').fill(l);
    await page.getByRole('button', { name: 'Добавить' }).click();
    await page.getByRole('cell', { name: `150 × ${l}` }).waitFor();
  }

  await page.goto(`${BASE}/app/stock`);
  await page.getByLabel('Артикул').selectOption({ label: '109029 · Сахара' });
  await page.getByLabel('Длина, см').fill('2500');
  await page.getByText('Площадь рулона: 37,5 м²').waitFor();
  await page.getByRole('button', { name: 'Принять' }).click();
  await page.getByRole('cell', { name: '150 × 2500' }).waitFor();
  await shot('02-stock');

  await page.goto(`${BASE}/app/cutting`);
  await page.getByLabel('Артикул').selectOption({ label: '109029 · Сахара' });
  await page.getByLabel('150 × 200').check();
  await page.getByLabel('150 × 300').check();
  await page.getByText('Можно выполнить').waitFor();
  await page.locator('.cutplan svg rect.piece').first().waitFor();
  await shot('03-cutting');
  const suggested = Number(await page.getByLabel('Количество 150 × 200').inputValue());
  assert.ok(suggested >= 1, 'the system must suggest at least one carpet 150×200');
  await page.getByRole('button', { name: 'Выполнить раскрой' }).click();
  await page.waitForURL('**/app/documents/**');
  await page.getByRole('heading', { name: /Документ № 1/ }).waitFor();
  const docUrl = page.url();
  await shot('04-document');

  await page.getByRole('button', { name: 'Исправить' }).click();
  const qty = page.getByLabel(/Рулон 150 × 2500 → 150 × 200, шт\./);
  const before = Number(await qty.inputValue());
  await qty.fill(String(before - 1));
  await page.getByLabel('Причина правки').fill('Один ковер ушел в брак');
  await page.getByRole('button', { name: 'Сохранить правку' }).click();
  await page.getByText(/версия 2/).waitFor();
  await page.getByText(/Ковров было/).waitFor();

  const id = docUrl.split('/').pop();
  const pdf = await page.request.get(`${BASE}/api/cuts/${id}/spec.pdf`);
  assert.equal(pdf.status(), 200);
  assert.match(pdf.headers()['content-type'], /application\/pdf/);
  assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');

  await page.goto(`${BASE}/app/stock`);
  await page.getByText('Поиск ковров').waitFor();
  await page.getByRole('cell', { name: '150 × 200' }).first().waitFor();

  console.log('SMOKE OK');
} catch (e) {
  await shot('failure').catch(() => undefined);
  console.error('SMOKE FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
