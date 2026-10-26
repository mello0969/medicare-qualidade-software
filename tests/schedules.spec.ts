import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { UserRole } from '../src/api';
import type { ScheduleEntry } from '../src/schedules';

async function mockSession(page: Page, role: UserRole = 'manager') {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: {
        user: {
          id: `schedule-${role}`,
          name: 'Equipe sintética de QA',
          email: 'escala@qa.medicare.local',
          role,
          sectorId: role === 'sector-admin' ? 'triagem' : null,
          mustChangePassword: false,
        },
        csrfToken: 'csrf-sintetico-escalas',
      },
    }),
  );
}

test('escala preserva a edição em conflito e exige revisar a versão atual', async ({ page }) => {
  await mockSession(page);
  let entry: ScheduleEntry = {
    sectorId: 'recepcao',
    date: '2026-10-02',
    shift: 'manha',
    team: 'Equipe A (exemplo)',
    version: 1,
  };
  let conflict = true;
  await page.route('**/api/schedules**', async (route) => {
    if (route.request().method() === 'GET') {
      const month = new URL(route.request().url()).searchParams.get('month');
      await route.fulfill({ json: { schedules: month === '2026-10' ? [entry] : [] } });
      return;
    }
    expect(route.request().headers()['x-csrf-token']).toBe('csrf-sintetico-escalas');
    const body = route.request().postDataJSON();
    if (conflict) {
      expect(body.expectedVersion).toBe(1);
      entry = { ...entry, team: 'Equipe C (exemplo)', version: 2 };
      conflict = false;
      await route.fulfill({ status: 409, json: { error: 'Conflito' } });
      return;
    }
    expect(body.expectedVersion).toBe(2);
    entry = { ...entry, team: body.team, version: 3 };
    await route.fulfill({ json: { schedule: entry } });
  });
  await page.goto('/#/escalas');
  await page.getByLabel('Mês da escala').fill('2026-10');
  await page.getByRole('button', { name: /^Editar escala de/ }).click();
  await page.getByLabel('Equipe', { exact: true }).fill('Equipe B (exemplo)');
  await page.getByRole('button', { name: 'Salvar escala', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('alterada por outra pessoa');
  await expect(page.getByLabel('Equipe', { exact: true })).toHaveValue('Equipe B (exemplo)');
  await expect(page.getByRole('button', { name: 'Salvar escala', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Recarregar mês' }).click();
  await expect(page.getByRole('cell', { name: 'Equipe C (exemplo)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Editar escala de/ }).click();
  await expect(page.getByLabel('Equipe', { exact: true })).toHaveValue('Equipe C (exemplo)');
  await page.getByLabel('Equipe', { exact: true }).fill('Equipe B (exemplo)');
  await page.getByRole('button', { name: 'Salvar escala', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Escala salva');
  await expect(page.getByRole('cell', { name: 'Equipe B (exemplo)', exact: true })).toBeVisible();
});

test('Gestão consulta escalas sem controles de edição e sem transbordamento', async ({ page }) => {
  await mockSession(page, 'management');
  await page.route('**/api/schedules**', (route) => {
    const month = new URL(route.request().url()).searchParams.get('month');
    return route.fulfill({
      json: {
        schedules: [
          {
            sectorId: 'enfermagem',
            date: `${month}-12`,
            shift: 'noite',
            team: 'Equipe de acompanhamento noturno (exemplo)',
            version: 1,
          },
        ],
      },
    });
  });
  await page.goto('/#/escalas');
  await expect(page.getByRole('cell', { name: 'Enfermagem', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar escala', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Editar escala de/ })).toHaveCount(0);
  await expect(page.locator('.schedule-table-wrap')).toHaveAttribute('tabindex', '0');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('Admin de Setor cadastra somente a equipe de seu setor com versão inicial zero', async ({
  page,
}) => {
  await mockSession(page, 'sector-admin');
  await page.route('**/api/schedules**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { schedules: [] } });
      return;
    }
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      sectorId: 'triagem',
      shift: 'tarde',
      team: 'Equipe T (exemplo)',
      expectedVersion: 0,
    });
    await route.fulfill({ json: { schedule: { ...body, version: 1 } } });
  });
  await page.goto('/#/escalas');
  const sectorOptions = await page
    .getByLabel('Setor da escala')
    .locator('option')
    .evaluateAll((options) => options.map((item) => (item as HTMLOptionElement).value));
  expect(sectorOptions).toEqual(['triagem']);
  await page.getByLabel('Turno da escala').selectOption('tarde');
  await page.getByLabel('Equipe', { exact: true }).fill('Equipe T (exemplo)');
  await page.getByRole('button', { name: 'Salvar escala', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Escala salva');
  await expect(page.getByRole('cell', { name: 'Equipe T (exemplo)', exact: true })).toBeVisible();
});
