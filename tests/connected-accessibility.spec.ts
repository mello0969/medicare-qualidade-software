import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticate } from './helpers';
import { skipUntilNps } from './helpers';
import { DEFAULT_SETTINGS } from '../src/domain';

async function audit(page: Page, route: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations,
    `${route}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(
    true,
  );
}

test('login e áreas da gestão acessíveis em computador e celular', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const directory = join(process.cwd(), '.impeccable', 'review');
  await mkdir(directory, { recursive: true });
  await page.goto('/#/login');
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
  await audit(page, 'login');
  await page.screenshot({
    path: join(directory, `fhdod-login-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await authenticate(page.context());
  // Cookie injection requires a full load so the mounted auth provider refreshes its session.
  await page.goto('/#/usuarios');
  await page.reload();
  for (const [route, name] of [
    ['/usuarios', 'users'],
    ['/perguntas', 'editor'],
    ['/painel?dados=servidor', 'panel'],
    ['/configuracoes', 'settings'],
    ['/ouvidoria', 'contacts'],
  ]) {
    await page.goto(`/#${route}`);
    if (name === 'users') await expect(page.locator('.user-row').first()).toBeVisible();
    else if (name === 'editor')
      await expect(page.getByLabel('Pergunta 1', { exact: true })).toBeVisible();
    else if (name === 'panel')
      await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
    else if (name === 'settings')
      await expect(page.getByLabel('E-mail da ouvidoria', { exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: 'Ouvidoria', exact: true })).toBeVisible();
    await audit(page, name);
    await page.screenshot({
      path: join(directory, `fhdod-${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('áreas restritas ao setor acessíveis e sem transbordamento', async ({ page }, testInfo) => {
  await authenticate(page.context(), 'sector');
  for (const route of [
    '/painel?dados=servidor',
    '/perguntas',
    '/usuarios',
    '/ouvidoria',
    '/configuracoes',
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (route === '/perguntas')
      await expect(page.getByLabel('Pergunta 1', { exact: true })).toBeVisible();
    if (route.startsWith('/painel'))
      await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
    await audit(page, route);
  }
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/#/perguntas');
    await expect(page.getByLabel('Pergunta 1', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('pedido de contato e confirmação acessíveis em computador e celular', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/pesquisa/triagem');
  await page.getByRole('button', { name: 'Começar pesquisa', exact: true }).click();
  await page.getByRole('radio', { name: '2 Ruim', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await skipUntilNps(page);
  await page.getByRole('radio', { name: '5', exact: true }).check();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Quero receber contato da ouvidoria', exact: true })
    .check();
  await page.getByLabel('Nome para contato', { exact: true }).fill('Pessoa fictícia de QA');
  await page.getByLabel('Telefone para contato', { exact: true }).fill('51999990000');
  await page
    .getByLabel('Conte o que aconteceu', { exact: true })
    .fill('Manifestação fictícia para verificar acessibilidade.');
  const settings = (await (await page.request.get('/api/settings')).json()).settings;
  await page
    .getByRole('checkbox', {
      name: settings.contactConsent ?? DEFAULT_SETTINGS.contactConsent,
      exact: true,
    })
    .check();
  const directory = join(process.cwd(), '.impeccable', 'review');
  await mkdir(directory, { recursive: true });
  await audit(page, 'contact-form');
  await page.screenshot({
    path: join(directory, `fhdod-contact-form-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar suas respostas' })).toBeVisible();
  await audit(page, 'confirmation');
  await page.screenshot({
    path: join(directory, `fhdod-confirmation-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('definição obrigatória de senha acessível em computador e celular', async ({
  page,
}, testInfo) => {
  await authenticate(page.context());
  const session = await (await page.request.get('/api/auth/session')).json();
  const email = `troca-senha-${randomUUID()}@qa.medicare.local`;
  const password = 'Temporaria-QA!2026';
  const created = await page.request.post('/api/admin/users', {
    headers: { Origin: 'http://127.0.0.1:5174', 'x-csrf-token': session.csrfToken },
    data: {
      name: 'Gestor fictício de QA',
      email,
      password,
      role: 'sector-admin',
      sectorId: 'triagem',
    },
  });
  expect(created.status()).toBe(201);
  await page.context().clearCookies();
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:5174' },
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  await page.goto('/#/painel?dados=servidor');
  await expect(page.getByRole('heading', { name: 'Defina sua senha', exact: true })).toBeVisible();
  await audit(page, 'new-password');
  const directory = join(process.cwd(), '.impeccable', 'review');
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: join(directory, `fhdod-new-password-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
