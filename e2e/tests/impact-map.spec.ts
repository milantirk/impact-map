import { expect, test, type Page } from '@playwright/test';

const gym =
  'Elmegyek az üzletbe, veszek egy sportcipőt, elmegyek a legközelebbi edzőterembe, veszek egy havi bérletet, és elkezdek edzeni, mert túlsúlyos lettem az elmúlt 1 hónapban egy sérülés miatt.';

/** Browser errors per page; every test must end without one. */
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') list.push(m.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

async function decide(page: Page, text: string) {
  await page.goto('/');
  await page.getByRole('textbox').first().fill(text);
  await expect(page.locator('[data-factor="regular_exercise"]')).toBeVisible();
}

test('maps a decision into factors, categories, graph and table', async ({ page }) => {
  await decide(page, gym);
  for (const id of ['weight_loss', 'gym_membership', 'sports_gear', 'injury_return']) {
    await expect(page.locator(`[data-factor="${id}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-factor="public_transport"]')).toHaveCount(0);
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', /\d+/);
  expect(await page.locator('g.node').count()).toBeGreaterThan(20);
  await expect(page.locator('g.node[data-id="root>health.safety"]')).toHaveClass(/neg/);

  await page.getByRole('tab', { name: /table|táblázat/ }).click();
  await expect(page.locator('tr.sub-row[data-id="health.physical"]')).toBeVisible();
});

test('collapses and expands a branch', async ({ page }) => {
  await decide(page, gym);
  const branch = page.locator('g.node[data-id="root>health.physical"]');
  const inside = page.locator('g.node[data-id^="root>health.physical>"]');
  await expect.poll(() => inside.count()).toBeGreaterThan(0);
  await branch.locator('circle.hit').click();
  await expect(inside).toHaveCount(0);
  await expect(branch).toHaveClass(/closed/);
  await branch.locator('circle.hit').click();
  await expect.poll(() => inside.count()).toBeGreaterThan(0);
});

test('steps, people and time window change the scenario', async ({ page }) => {
  await decide(page, gym);
  const sliders = page.locator('aside input[type=range]');
  await sliders.nth(0).fill('1');
  await expect
    .poll(() => page.locator('g.node[data-id*=">"][data-id$="health.longevity"]').count())
    .toBe(1);
  await sliders.nth(1).fill('5');
  await page.locator('aside select').first().selectOption('30');
  await page.getByRole('tab', { name: /table|táblázat/ }).click();
  await expect(page.locator('.impact-table thead')).toContainText(/Change|Változás/);
});

test('saves, shares and restores a decision model', async ({ page, context }) => {
  await decide(page, gym);
  await page.locator('[data-factor="injury_return"] button.x').click();
  await page.getByRole('button', { name: /Save and share|Mentés és megosztás/ }).click();
  await expect(page).toHaveURL(/\?d=[\w-]{10}$/);

  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('textbox').first()).toHaveValue(gym);
  await expect(other.locator('[data-factor="gym_membership"]')).toBeVisible();
  await expect(other.locator('[data-factor="injury_return"]')).toHaveCount(0);
});

test('switches theme and language', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Light \/ dark|Világos \/ sötét/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  const before = await page.locator('html').getAttribute('lang');
  await page.getByRole('button', { name: 'language' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('lang', before ?? '');
});

test('serves health, security and cache headers', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.ok()).toBe(true);
  const home = await request.get('/');
  expect(home.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(home.headers()['cache-control']).toContain('no-cache');
  const api = await request.post('/api/v1/analyze', { data: { text: 'Autót veszek.' } });
  expect(api.ok()).toBe(true);
  expect((await api.json()).factors[0].id).toBe('buy_car');
});

test('captures light and dark screenshots for review', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await decide(page, gym);
    await page.locator('.graph').scrollIntoViewIfNeeded();
    await test.info().attach(`impact-map-${theme}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});
