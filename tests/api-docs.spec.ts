import { test, expect } from '@playwright/test';
import { loginViaForm } from './helpers';
import { mkdirSync } from 'node:fs';

test('Swagger carrega sem CDN e executa uma leitura real pela mesma origem', async ({
  page,
}, testInfo) => {
  await page.goto('/api/docs');
  await expect(page.getByRole('heading', { name: /FHDOD/ }).first()).toBeVisible();
  const questionOperation = page.locator('.opblock.opblock-get').filter({
    has: page.locator('[data-path="/api/questions"]'),
  });
  await questionOperation.locator('.opblock-summary').click();
  await questionOperation.getByRole('button', { name: 'Try it out' }).click();
  await questionOperation.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(questionOperation.locator('.responses-wrapper')).toContainText(
    'recepcao-atendimento',
  );
  await expect(
    questionOperation.locator('.live-responses-table tbody .response-col_status'),
  ).toHaveText('200');
  const specification = await page.request.get('/api/openapi.json');
  expect(specification.status()).toBe(200);
  expect(Object.keys((await specification.json()).paths)).toContain('/api/auth/login');
  mkdirSync('docs/evidencias', { recursive: true });
  await questionOperation.screenshot({
    path: `docs/evidencias/swagger-${testInfo.project.name}.png`,
  });
});

test('Swagger reutiliza o cookie e obtém CSRF ao encerrar a própria sessão', async ({ page }) => {
  await loginViaForm(page);
  await page.goto('/api/docs');
  const logout = page.locator('.opblock.opblock-post').filter({
    has: page.locator('[data-path="/api/auth/logout"]'),
  });
  await logout.locator('.opblock-summary').click();
  await logout.getByRole('button', { name: 'Try it out' }).click();
  await logout.getByRole('button', { name: 'Execute', exact: true }).click();
  await expect(logout.locator('.live-responses-table tbody .response-col_status')).toHaveText(
    '204',
  );
  expect((await page.request.get('/api/admin/users')).status()).toBe(401);
});
