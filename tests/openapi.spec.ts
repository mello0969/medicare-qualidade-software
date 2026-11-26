import { test, expect } from '@playwright/test';
test('Swagger UI carrega localmente e executa o endpoint público de saúde', async ({
  page,
  request,
}) => {
  const spec = await (await request.get('/api/openapi.json')).json();
  expect(spec.openapi).toBe('3.1.0');
  expect(spec.paths['/api/admin/audit'].get.security).toEqual([{ session: [] }]);
  await page.goto('/api/docs');
  await expect(page).toHaveURL(/documentacao\.html$/);
  const row = page
    .locator('.opblock')
    .filter({ has: page.locator('.opblock-summary-path[data-path="/api/health"]') });
  await row.locator('.opblock-summary-control').click();
  await row.getByRole('button', { name: 'Try it out' }).click();
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/health');
  await row.getByRole('button', { name: 'Execute' }).click();
  expect(await (await response).json()).toEqual({ ok: true });
  await expect(row.locator('.live-responses-table')).toContainText('200');
});
