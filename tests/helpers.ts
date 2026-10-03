import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { QA_MANAGER } from './credentials';

export async function authenticate(
  context: BrowserContext,
  role: 'manager' | 'sector' = 'manager',
) {
  const tokens = JSON.parse(
    readFileSync(join(process.env.MEDICARE_E2E_DIRECTORY!, 'sessions.json'), 'utf8'),
  ) as Record<string, string>;
  await context.addCookies([
    {
      name: 'medicare_session',
      value: tokens[role],
      url: 'http://127.0.0.1:5174',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function loginViaForm(
  page: Page,
  account: { email: string; password: string } = QA_MANAGER,
) {
  await page.goto('/#/login');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email);
  await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByLabel('Origem dos dados')).toHaveValue('server');
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
}

export async function completeSectorSurvey(page: Page, sector: string, comment: string) {
  await page.goto(`/#/pesquisa/${sector}`);
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await answerUntilNps(page);
  await page.getByRole('radio', { name: '10', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Seu comentário').fill(comment);
}

export async function answerUntilNps(page: Page, rating = '5 Muito bom') {
  const nps = page.getByRole('radio', { name: '10', exact: true });
  for (let index = 0; index < 45; index++) {
    if (await nps.count()) return;
    await page.getByRole('radio', { name: rating, exact: true }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  throw new Error('A pesquisa não chegou à pergunta obrigatória de NPS.');
}

export async function skipUntilNps(page: Page) {
  const nps = page.getByRole('radio', { name: '10', exact: true });
  for (let index = 0; index < 45; index++) {
    if (await nps.count()) return;
    await page.getByRole('button', { name: 'Pular pergunta', exact: true }).click();
  }
  throw new Error('Não foi possível pular as perguntas opcionais até o NPS.');
}

export async function confirmSurvey(page: Page) {
  await page.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar suas respostas' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Obrigado por compartilhar.' })).toBeVisible();
}
