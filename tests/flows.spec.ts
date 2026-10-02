import { test, expect } from '@playwright/test';

test('paciente responde, dados persistem e painel usa apenas as respostas locais', async ({
  page,
}) => {
  await page.goto('/#/pesquisa/triagem');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Escolha uma nota');
  await page.getByRole('radio', { name: '5 Muito bom', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('radio', { name: '4 Bom', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('radio', { name: '10', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Seu comentário').fill('Comentário fictício para validar o fluxo.');
  await page.getByRole('button', { name: 'Concluir pesquisa' }).click();
  await expect(page.getByRole('heading', { name: 'Obrigado por compartilhar.' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver a resposta no painel' }).click();
  await expect(page.locator('.metric').first()).toContainText('1');
  await expect(page.locator('.nps-score')).toContainText('+100');
  await expect(page.locator('.comment')).toContainText('Comentário fictício');
  await page.reload();
  await expect(page.locator('.nps-score')).toContainText('+100');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('medicare.responses.v1')!).length),
  ).toBe(1);
});

test('filtros, vazio, restauração e download Excel', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('combobox', { name: 'Setor', exact: true }).selectOption('triagem');
  await expect(page.locator('.sector-scores')).toContainText('Triagem');
  await expect(page.locator('.sector-scores')).not.toContainText('Recepção');
  await page.getByLabel('De', { exact: true }).fill('2099-01-01');
  await expect(
    page.getByRole('heading', { name: 'Nenhuma resposta com esses filtros' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await download.failure()).toBeNull();
  await page.getByLabel('Origem dos dados').selectOption('local');
  await expect(
    page.getByRole('heading', { name: 'Sua primeira resposta começa aqui' }),
  ).toBeVisible();
});

test('edição de perguntas preserva versão e é usada por novas pesquisas', async ({ page }) => {
  await page.goto('/#/perguntas');
  await page
    .getByLabel('Pergunta 1', { exact: true })
    .fill('Você recebeu as orientações necessárias na recepção?');
  await page.getByRole('button', { name: 'Salvar perguntas' }).click();
  await expect(page.getByRole('status')).toContainText('Perguntas salvas');
  await expect(page.locator('.question-edit').first()).toContainText('Versão 2');
  await page.goto('/#/pesquisa/recepcao');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await expect(
    page.getByRole('heading', { name: 'Você recebeu as orientações necessárias na recepção?' }),
  ).toBeVisible();
});

test('armazenamento corrompido é informado sem apagar dados', async ({ page }) => {
  await page.goto('/#/');
  await page.evaluate(() => localStorage.setItem('medicare.responses.v1', 'corrompido'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('não foram substituídos');
  expect(await page.evaluate(() => localStorage.getItem('medicare.responses.v1'))).toBe(
    'corrompido',
  );
});

test('telas sem transbordamento, console limpo e movimento reduzido', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/pesquisas', '/perguntas', '/pesquisa', '/pesquisa/triagem']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
