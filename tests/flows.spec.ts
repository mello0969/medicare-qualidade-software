import { test, expect } from '@playwright/test';
import { answerUntilNps, confirmSurvey, skipUntilNps } from './helpers';
import { DEFAULT_QUESTIONS } from '../src/domain';

test('primeira tela identifica o hospital e separa equipe e paciente', async ({ page }) => {
  await page.goto('/#/');
  await expect(
    page.getByRole('img', { name: /Fundação Hospitalar Dr\. Oswaldo Diesel/ }).first(),
  ).toBeVisible();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: /Responder.*pesquisa/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Começar pesquisa' })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveCount(0);
});

test('paciente responde, dados persistem e painel usa apenas as respostas locais', async ({
  page,
}) => {
  await page.goto('/#/pesquisa/triagem?modo=local');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('alert')).toContainText('Escolha uma nota');
  await answerUntilNps(page);
  await page.getByRole('radio', { name: '10', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Seu comentário').fill('Comentário fictício para validar o fluxo.');
  await confirmSurvey(page);
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
  await page.goto('/#/demonstracao');
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
  await page.goto('/#/perguntas?modo=local');
  await page
    .getByLabel('Pergunta 1', { exact: true })
    .fill('Você recebeu as orientações necessárias na recepção?');
  await page.getByRole('button', { name: 'Salvar perguntas' }).click();
  await expect(page.getByRole('status')).toContainText('Perguntas salvas');
  await expect(page.locator('.question-edit').first()).toContainText('Versão 2');
  await page.goto('/#/pesquisa/recepcao?modo=local');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await expect(
    page.getByRole('heading', { name: 'Você recebeu as orientações necessárias na recepção?' }),
  ).toBeVisible();
});

test('armazenamento corrompido é informado sem apagar dados', async ({ page }) => {
  await page.goto('/#/demonstracao');
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
  for (const route of [
    '/',
    '/demonstracao',
    '/pesquisas',
    '/perguntas?modo=local',
    '/pesquisa',
    '/pesquisa/triagem',
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('perguntas específicas precedem gerais; avaliações são opcionais e NPS é obrigatório', async ({
  page,
}) => {
  await page.goto('/#/pesquisa/triagem?modo=local');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  const expected = DEFAULT_QUESTIONS.filter(
    (q) => q.sectorId === 'triagem' || q.sectorId === 'geral',
  );
  for (const question of expected) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(question.text);
    await page.getByRole('button', { name: 'Pular pergunta', exact: true }).click();
  }
  await expect(page.getByRole('radio', { name: '10', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pular pergunta', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/nota|NPS/i);
  await page.getByRole('radio', { name: '0', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Quero receber contato da ouvidoria', exact: true }),
  ).toHaveCount(0);
  await confirmSurvey(page);
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('medicare.responses.v1')!),
  );
  expect(records[0].nps).toBe(0);
  expect(records[0].answers).toEqual([]);
});

test('nota neutra mantém contato oculto e avaliação ruim permite seguir sem contato', async ({
  page,
}) => {
  const submissions: { contactRequest?: unknown }[] = [];
  await page.route('**/api/responses', async (route) => {
    if (route.request().method() === 'POST') submissions.push(route.request().postDataJSON());
    await route.continue();
  });
  for (const rating of ['3 Regular', '2 Ruim']) {
    await page.goto('/#/pesquisa/triagem');
    await page.reload();
    await page.getByRole('button', { name: 'Começar pesquisa' }).click();
    await page.getByRole('radio', { name: rating, exact: true }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await skipUntilNps(page);
    await page.getByRole('radio', { name: '8', exact: true }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const contact = page.getByRole('checkbox', {
      name: 'Quero receber contato da ouvidoria',
      exact: true,
    });
    if (rating.startsWith('3')) await expect(contact).toHaveCount(0);
    else {
      await expect(contact).not.toBeChecked();
      await expect(page.getByLabel('Nome para contato', { exact: true })).toHaveCount(0);
    }
    await confirmSurvey(page);
  }
  expect(submissions).toHaveLength(2);
  expect(submissions.every((r) => !r.contactRequest)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('medicare.responses.v1'))).toBeNull();
});

test('retirar um setor descarta sua nota ruim do contato e da confirmação', async ({ page }) => {
  await page.goto('/#/pesquisa');
  await page.getByRole('checkbox', { name: /Recepção/ }).check();
  await page.getByRole('checkbox', { name: /Triagem/ }).check();
  await page.getByRole('button', { name: 'Começar pesquisa', exact: true }).click();
  await page.getByRole('radio', { name: '2 Ruim', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByRole('checkbox', { name: /Recepção/ }).uncheck();
  await page.getByRole('button', { name: 'Começar pesquisa', exact: true }).click();
  let count = 0;
  const nps = page.getByRole('radio', { name: '10', exact: true });
  for (let index = 0; index < 45; index++) {
    if (await nps.count()) break;
    await page.getByRole('radio', { name: '5 Muito bom', exact: true }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    count++;
  }
  await expect(nps).toBeVisible();
  await nps.check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Quero receber contato da ouvidoria', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar suas respostas' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('dd').first()).toHaveText(String(count));
  await expect(dialog.locator('dd').last()).toHaveText('Não solicitado');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir pesquisa', exact: true })).toBeFocused();
});
