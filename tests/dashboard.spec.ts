import { test, expect } from '@playwright/test';
import { authenticate } from './helpers';
import { mkdir } from 'node:fs/promises';
test('consulta, compara e exporta os indicadores e abre o detalhe do setor', async ({
  page,
}, testInfo) => {
  await authenticate(page.context());
  await page.goto('/#/painel?dados=exemplo');
  await expect(page.locator('.kpi')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: /Olá,/ })).toBeVisible();
  await expect(page.locator('.score-list li')).toHaveCount(11);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({
    path: '.impeccable/review/painel-indicadores-' + testInfo.project.name + '.png',
    fullPage: true,
  });
  if (testInfo.project.name === 'desktop')
    await page.screenshot({ path: '.impeccable/review/painel-visao-inicial.png' });
  await page.getByLabel('Comparar com o período anterior').check();
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.locator('.kpi small').first()).toContainText('Anterior: —');
  await page.getByText('Ver tabela da tendência', { exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Notas válidas' })).toBeVisible();
  await page.getByRole('button', { name: 'Triagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Perguntas do setor' })).toBeVisible();
  if (testInfo.project.name === 'desktop')
    await page
      .locator('.sector-scores')
      .screenshot({ path: '.impeccable/review/painel-detalhe-setor.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar indicadores (Excel)' }).click();
  expect((await download).suggestedFilename()).toMatch(/^fhdod-indicadores-.*\.xlsx$/);
  await page.goto('/#/setores');
  await expect(page.getByText('Equipes por setor no mês')).toBeVisible();
  await page.goto('/#/auditoria');
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  expect((await page.request.get('/api/admin/audit')).status()).toBe(200);
  await page.goto('/#/relatorios');
  await expect(page.getByRole('heading', { name: 'Relatórios', exact: true })).toBeVisible();
});

test('mostra carregamento e falha sem publicar zeros, recuperando após atualizar', async ({
  page,
}) => {
  await authenticate(page.context());
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  let fail = true;
  await page.route('**/api/responses', async (route) => {
    await gate;
    if (fail) await route.fulfill({ status: 503, json: { error: 'Falha fictícia' } });
    else await route.fulfill({ json: { responses: [] } });
  });
  await page.goto('/#/painel?dados=servidor');
  await expect(page.getByRole('status')).toContainText('Buscando');
  await expect(page.locator('.kpi')).toHaveCount(0);
  release();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.kpi')).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.locator('.kpi strong').first()).toHaveText('—');
  await expect(page.getByRole('button', { name: 'Exportar respostas (Excel)' })).toBeDisabled();
});

test('painel conserva os controles em 320 px, tablet e notebook', async ({ page }) => {
  await page.goto('/#/demonstracao');
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole('button', { name: 'Aplicar filtros' })).toBeVisible();
    await expect(page.locator('.kpi')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
