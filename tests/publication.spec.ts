import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import jsQR from 'jsqr';
import { SECTORS, createDemoResponses, type Question } from '../src/domain';
import { buildWallSummary, type WallSummary } from '../src/wall';
import { authenticate } from './helpers';

const origin = 'http://127.0.0.1:5174';

async function decodeDownloadedQr(page: Page, png: Buffer) {
  const pixels = await page.evaluate(
    async (encoded) => {
      const image = new Image();
      image.src = encoded;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('O navegador não oferece o canvas necessário para ler o PNG.');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let binary = '';
      for (let offset = 0; offset < data.length; offset += 8192)
        binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
      return { rgba: btoa(binary), width: canvas.width, height: canvas.height };
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  return jsQR(
    new Uint8ClampedArray(Buffer.from(pixels.rgba, 'base64')),
    pixels.width,
    pixels.height,
    { inversionAttempts: 'dontInvert' },
  )?.data;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test.describe('QR Codes, TV Wall e permissões de publicação', () => {
  test('cada PNG baixado contém o QR Code legível da URL correta do setor', async ({ page }) => {
    test.setTimeout(60000);
    await authenticate(page.context());
    await page.goto('/#/pesquisas');
    await expect(
      page.getByRole('heading', { name: 'Pesquisas por setor', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /^QR Code para responder/ })).toHaveCount(6);

    for (const sector of SECTORS) {
      const row = page.getByRole('article').filter({
        has: page.getByRole('heading', { name: sector.name, exact: true }),
      });
      const expectedUrl = `${origin}/#/pesquisa/${sector.id}`;
      await expect(row.getByRole('textbox')).toHaveValue(expectedUrl);
      await expect(row.getByRole('link', { name: 'Abrir pesquisa', exact: true })).toHaveAttribute(
        'href',
        `#/pesquisa/${sector.id}`,
      );
      const downloading = page.waitForEvent('download');
      await row
        .getByRole('link', { name: `Baixar QR Code de ${sector.name} em PNG`, exact: true })
        .click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(`pesquisa-fhdod-${sector.id}.png`);
      const stream = await download.createReadStream();
      if (!stream) throw new Error('O download não disponibilizou o PNG do setor.');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const png = Buffer.concat(chunks);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(await decodeDownloadedQr(page, png)).toBe(expectedUrl);
    }
    await expectAccessible(page);
    await page.goto(`${origin}/#/pesquisa/recepcao`);
    await expect(page.getByRole('button', { name: 'Começar pesquisa', exact: true })).toBeVisible();
    await expect(page.locator('.sector-choice.selected')).toContainText('Recepção');
  });

  test('TV Wall de exemplo é transparente e não consulta indicadores do servidor', async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/wall') requests.push(request.url());
    });
    await page.goto('/#/tv-wall?dados=exemplo');
    await expect(
      page.getByRole('heading', { name: 'Experiência do paciente', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Demonstração com dados fictícios/)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Exemplo gerado');
    await expect(page.locator('.wall-sector')).toHaveCount(6);
    await expect(page.locator('.wall-metric-value').first()).not.toHaveText('—');
    expect(requests).toEqual([]);
    await expectAccessible(page);
  });

  test('TV Wall público reflete pesquisas e publica somente agregados sem contato nem relatos', async ({
    page,
  }) => {
    const marker = randomUUID();
    const privateName = `Paciente fictício ${marker}`;
    const privateComment = `Relato reservado ${marker}`;
    const privateMessage = `Pedido reservado de retorno ${marker}`;
    const questions = (await (await page.request.get('/api/questions')).json())
      .questions as Question[];
    const settings = (await (await page.request.get('/api/settings')).json()).settings;
    for (let index = 0; index < 5; index++) {
      const saved = await page.request.post('/api/responses', {
        headers: { Origin: origin },
        data: {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          sectorIds: ['triagem'],
          answers: questions
            .filter((q) => q.sectorId === 'triagem')
            .map((q) => ({
              questionId: q.id,
              questionText: q.text,
              questionVersion: q.version,
              sectorId: q.sectorId,
              value: index === 0 ? 2 : 5,
            })),
          nps: index === 0 ? 4 : 10,
          comment: privateComment,
          shift: 'nao-informado',
          doctor: '',
          ...(index === 0
            ? {
                contactRequest: {
                  name: privateName,
                  phone: '51999990000',
                  email: '',
                  message: privateMessage,
                  consent: true,
                  settingsVersion: settings.version,
                },
              }
            : {}),
        },
      });
      expect(saved.status()).toBe(201);
    }
    const response = await page.request.get('/api/wall');
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(Object.keys(payload)).toEqual(['summary']);
    const summary = payload.summary as WallSummary;
    expect(Object.keys(summary).sort()).toEqual(
      ['updatedAt', 'period', 'minimumResponses', 'total', 'nps', 'satisfaction', 'sectors'].sort(),
    );
    expect(summary.total).toBeGreaterThanOrEqual(5);
    expect(summary.minimumResponses).toBe(5);
    for (const sector of summary.sectors) {
      expect(Object.keys(sector).sort()).toEqual(['id', 'name', 'responses', 'average'].sort());
      if (sector.responses === null) expect(sector.average).toBeNull();
      else expect(sector.responses).toBeGreaterThanOrEqual(5);
    }
    const serialized = JSON.stringify(payload);
    for (const privateValue of [privateName, privateComment, privateMessage, '51999990000'])
      expect(serialized).not.toContain(privateValue);
    expect((await page.request.get('/api/responses')).status()).toBe(401);

    const detailedRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/responses')
        detailedRequests.push(request.url());
    });
    await page.goto('/#/tv-wall');
    await expect(page.getByRole('status')).toContainText('Atualizado às');
    await expect(page.locator('.wall-metric-value').first()).not.toHaveText('—');
    await expect(page.getByText(/pesquisas enviadas nos últimos 30 dias/)).toBeVisible();
    const triage = page.locator('.wall-sector').filter({
      has: page.getByRole('heading', { name: 'Triagem', exact: true }),
    });
    await expect(triage).toContainText(/\d+ pesquisas com notas neste setor/);
    for (const privateValue of [privateName, privateComment, privateMessage, '51999990000'])
      await expect(page.locator('body')).not.toContainText(privateValue);
    expect(detailedRequests).toEqual([]);
    await expectAccessible(page);
  });

  test('falha inicial do TV Wall não apresenta números fictícios', async ({ page }) => {
    await page.route('**/api/wall', (route) =>
      route.fulfill({ status: 503, json: { error: 'QA' } }),
    );
    await page.goto('/#/tv-wall');
    await expect(page.getByRole('status')).toContainText('Indicadores indisponíveis');
    await expect(page.locator('.wall-metric-value')).toHaveText(['—', '—', '—']);
    await expect(page.getByText(/Demonstração com dados fictícios/)).toHaveCount(0);
  });

  test('falha após atualização preserva os indicadores e sinaliza que estão desatualizados', async ({
    page,
  }) => {
    await page.clock.install();
    const summary = buildWallSummary(createDemoResponses());
    let requests = 0;
    await page.route('**/api/wall', (route) => {
      requests++;
      return requests === 1
        ? route.fulfill({ status: 200, json: { summary } })
        : route.fulfill({ status: 503, json: { error: 'QA' } });
    });
    await page.goto('/#/tv-wall');
    await expect(page.getByRole('status')).toContainText('Atualizado às');
    const firstTotal = await page.locator('.wall-metric-value').first().innerText();
    await page.clock.fastForward(15000);
    await expect(page.getByRole('status')).toContainText('Dados sem atualização');
    await expect(page.locator('.wall-metric-value').first()).toHaveText(firstTotal);
    expect(requests).toBeGreaterThanOrEqual(2);
  });

  for (const role of ['viewer', 'ombudsman'] as const) {
    test(`${role} recebe painel agregado e somente as opções permitidas`, async ({
      page,
      browser,
    }) => {
      const admin = await browser.newContext({ baseURL: origin });
      const email = `${role}-${randomUUID()}@qa.medicare.local`;
      const temporaryPassword = 'Temporaria-publicacao-QA!2026';
      const newPassword = 'Definitiva-publicacao-QA!2026';
      try {
        await authenticate(admin);
        const session = await (await admin.request.get('/api/auth/session')).json();
        const created = await admin.request.post('/api/admin/users', {
          headers: { Origin: origin, 'x-csrf-token': session.csrfToken },
          data: {
            name: `Perfil ${role} de QA`,
            email,
            password: temporaryPassword,
            role,
            sectorId: null,
          },
        });
        expect(created.status()).toBe(201);
      } finally {
        await admin.close();
      }
      const login = await page.request.post('/api/auth/login', {
        headers: { Origin: origin },
        data: { email, password: temporaryPassword },
      });
      expect(login.status()).toBe(200);
      const session = await login.json();
      const changed = await page.request.post('/api/auth/password', {
        headers: { Origin: origin, 'x-csrf-token': session.csrfToken },
        data: { currentPassword: temporaryPassword, newPassword },
      });
      expect(changed.status()).toBe(200);
      const detailedRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/responses')
          detailedRequests.push(request.url());
      });
      await page.goto('/#/painel?dados=servidor');
      await expect(
        page.getByRole('heading', { name: 'Experiência do paciente', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.tv-wall-embedded')).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Atualizado às');
      await expect(page.getByRole('link', { name: 'Abrir TV Wall', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Exportar Excel', exact: true })).toHaveCount(
        0,
      );
      const openMenu = page.getByRole('button', { name: 'Abrir navegação', exact: true });
      if (await openMenu.isVisible()) await openMenu.click();
      for (const label of [
        'Acessos da equipe',
        'Mensagens da pesquisa',
        'Editar perguntas',
        'Escalas das equipes',
      ])
        await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Ouvidoria', exact: true })).toHaveCount(
        role === 'ombudsman' ? 1 : 0,
      );
      const closeMenu = page.getByRole('button', { name: 'Fechar navegação', exact: true });
      if (await closeMenu.isVisible()) await closeMenu.click();
      expect(detailedRequests).toEqual([]);
      expect((await page.request.get('/api/responses')).status()).toBe(403);
      expect((await page.request.get('/api/admin/users')).status()).toBe(403);
      expect((await page.request.get('/api/admin/contacts')).status()).toBe(
        role === 'ombudsman' ? 200 : 403,
      );
      await expectAccessible(page);
      await page.goto('/#/perguntas');
      await expect(
        page.getByRole('heading', { name: 'Seu perfil não tem acesso a esta área.', exact: true }),
      ).toBeVisible();
    });
  }
});
