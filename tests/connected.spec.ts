import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  authenticate,
  answerUntilNps,
  completeSectorSurvey,
  confirmSurvey,
  loginViaForm,
  skipUntilNps,
} from './helpers';
import {
  DEFAULT_SETTINGS,
  type Question,
  type SurveyResponse,
  type ContactRequest,
} from '../src/domain';

test.describe('pesquisa compartilhada e administração', () => {
  test.describe.configure({ mode: 'serial' });

  test('pesquisa anônima aparece no painel de outro navegador após login', async ({
    page,
    browser,
  }) => {
    const comment = `Pesquisa sintética compartilhada ${randomUUID()}`;
    await completeSectorSurvey(page, 'triagem', comment);
    await confirmSurvey(page);
    expect(await page.evaluate(() => localStorage.getItem('medicare.responses.v1'))).toBeNull();
    await expect(page.getByRole('link', { name: 'Ver a resposta no painel' })).toHaveCount(0);

    const managerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
    try {
      const manager = await managerContext.newPage();
      await loginViaForm(manager);
      await expect(manager.locator('.comment').filter({ hasText: comment })).toBeVisible();
      await manager.reload();
      await expect(manager.locator('.comment').filter({ hasText: comment })).toBeVisible();
      expect(
        await manager.evaluate(() => localStorage.getItem('medicare.responses.v1')),
      ).toBeNull();
    } finally {
      await managerContext.close();
    }
  });

  test('administrador de setor recebe somente seu setor e não administra contas', async ({
    page,
  }) => {
    const questions = (await (await page.request.get('/api/questions')).json())
      .questions as Question[];
    const mixed = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sectorIds: ['recepcao', 'triagem', 'medico'],
      answers: questions
        .filter((q) => ['recepcao', 'triagem', 'medico'].includes(q.sectorId))
        .map((q) => ({
          questionId: q.id,
          questionText: q.text,
          questionVersion: q.version,
          sectorId: q.sectorId,
          value: 5,
        })),
      nps: 9,
      comment: 'Comentário geral reservado à gestão de QA.',
      shift: 'par',
      doctor: 'Profissional fictício de QA',
    };
    const saved = await page.request.post('/api/responses', {
      headers: { Origin: 'http://127.0.0.1:5174' },
      data: mixed,
    });
    expect(saved.status()).toBe(201);
    await authenticate(page.context(), 'sector');
    await page.goto('/#/painel?dados=servidor');
    await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
    await expect(page.locator('.data-mode')).toContainText('Acesso restrito a Triagem');
    await expect(page.locator('.sector-scores')).toContainText('Triagem');
    await expect(page.locator('.sector-scores')).not.toContainText('Recepção');
    const allowed = await page
      .getByRole('combobox', { name: 'Setor', exact: true })
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(allowed).toEqual(['', 'triagem']);
    const data = await (await page.request.get('/api/responses')).json();
    const scoped = data.responses.find((r: SurveyResponse) => r.id === mixed.id) as SurveyResponse;
    expect(scoped.sectorIds).toEqual(['triagem']);
    expect(scoped.answers.every((answer) => answer.sectorId === 'triagem')).toBe(true);
    expect(scoped.comment).toBe('');
    expect(scoped.doctor).toBe('');
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/admin/contacts')).status()).toBe(403);
    await expect(page.getByRole('link', { name: 'Acessos da equipe' })).toHaveCount(0);
    await page.goto('/#/perguntas');
    await expect(page.getByLabel('Pergunta 1', { exact: true })).toBeVisible();
    const editorAllowed = await page
      .getByLabel('Setor da pesquisa')
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(editorAllowed).toEqual(['triagem']);
    await page.goto('/#/usuarios');
    await expect(
      page.getByRole('heading', { name: 'Acessos são administrados pela gestão.' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar acesso', exact: true })).toHaveCount(0);
  });

  test('editar pergunta publica a nova versão sem alterar uma pesquisa já iniciada', async ({
    page,
    browser,
  }) => {
    await page.goto('/#/pesquisa/recepcao');
    await page.getByRole('button', { name: 'Começar pesquisa' }).click();
    const oldText = await page.getByRole('heading', { level: 1 }).innerText();
    const questions = (await (await page.request.get('/api/questions')).json())
      .questions as Question[];
    const oldQuestion = questions.find((q) => q.id === 'recepcao-atendimento')!;
    const editedText = 'As orientações recebidas na recepção foram claras para você?';
    const editorContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
    try {
      await authenticate(editorContext);
      const editor = await editorContext.newPage();
      await editor.goto('/#/perguntas');
      await editor.getByLabel('Pergunta 1', { exact: true }).fill(editedText);
      await editor.getByRole('button', { name: 'Salvar perguntas' }).click();
      await expect(editor.getByRole('status')).toContainText('Perguntas salvas');
      await expect(editor.locator('.question-edit').first()).toContainText(
        `Versão ${oldQuestion.version + 1}`,
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(oldText);
      await answerUntilNps(page);
      await page.getByRole('radio', { name: '10', exact: true }).check();
      await page.getByRole('button', { name: 'Continuar' }).click();
      const comment = `Versão histórica fictícia ${randomUUID()}`;
      await page.getByLabel('Seu comentário').fill(comment);
      await confirmSurvey(page);
      const records = (await (await editor.request.get('/api/responses')).json())
        .responses as SurveyResponse[];
      const historical = records.find((response) => response.comment === comment)!;
      expect(
        historical.answers.find((answer) => answer.questionId === oldQuestion.id),
      ).toMatchObject({
        questionText: oldQuestion.text,
        questionVersion: oldQuestion.version,
      });
      await page.goto('/#/pesquisa/recepcao');
      await page.reload();
      await page.getByRole('button', { name: 'Começar pesquisa' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(editedText);
    } finally {
      await editorContext.close();
    }
  });

  test('admin cria senha temporária e gestor define senha própria antes de acessar o setor', async ({
    page,
    browser,
  }) => {
    await authenticate(page.context());
    await page.goto('/#/usuarios');
    const email = `enfermagem-${randomUUID()}@qa.medicare.local`;
    const password = 'Acesso-Sintetico-QA!2026';
    const newPassword = 'Senha-Pessoal-QA!2026';
    await page.getByLabel('Nome', { exact: true }).fill('Enfermagem sintética de QA');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha temporária', { exact: true }).fill(password);
    await page.getByLabel('Setor permitido').selectOption('enfermagem');
    await page.getByRole('button', { name: 'Criar acesso', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'Acesso de Enfermagem sintética de QA criado',
    );
    await expect(page.getByLabel('Senha temporária', { exact: true })).toHaveValue('');
    await expect(page.locator('.user-row').filter({ hasText: email })).toContainText('Enfermagem');
    const createdContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
    try {
      const createdPage = await createdContext.newPage();
      await createdPage.goto('/#/login');
      await createdPage.getByLabel('E-mail', { exact: true }).fill(email);
      await createdPage.getByLabel('Senha', { exact: true }).fill(password);
      await createdPage.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(
        createdPage.getByRole('heading', { name: 'Defina sua senha', exact: true }),
      ).toBeVisible();
      expect((await createdPage.request.get('/api/responses')).status()).toBe(403);
      await createdPage.goto('/#/perguntas');
      await expect(
        createdPage.getByRole('heading', { name: 'Defina sua senha', exact: true }),
      ).toBeVisible();
      await createdPage.getByLabel('Senha temporária', { exact: true }).fill(password);
      await createdPage.getByLabel('Nova senha', { exact: true }).fill(newPassword);
      await createdPage
        .getByLabel('Confirmar nova senha', { exact: true })
        .fill('Outra-Senha-QA!2026');
      await createdPage.getByRole('button', { name: 'Salvar minha senha', exact: true }).click();
      await expect(createdPage.getByRole('alert')).toContainText(/iguais|coincidir|confirmação/i);
      await createdPage.getByLabel('Confirmar nova senha', { exact: true }).fill(newPassword);
      await createdPage.getByRole('button', { name: 'Salvar minha senha', exact: true }).click();
      await expect(createdPage.getByLabel('Origem dos dados')).toHaveValue('server');
      await expect(createdPage.locator('.data-mode')).toContainText('Acesso restrito a Enfermagem');
      expect((await createdPage.request.get('/api/responses')).status()).toBe(200);
      await createdPage.goto('/#/perguntas');
      await expect(createdPage.getByLabel('Setor da pesquisa')).toHaveValue('enfermagem');
      await expect(createdPage.getByLabel('Pergunta 1', { exact: true })).toBeVisible();
      await createdPage.getByRole('button', { name: 'Sair', exact: true }).click();
      const oldPasswordLogin = await createdPage.request.post('/api/auth/login', {
        headers: { Origin: 'http://127.0.0.1:5174' },
        data: { email, password },
      });
      expect(oldPasswordLogin.status()).toBe(401);
      await loginViaForm(createdPage, { email, password: newPassword });
      const adminUsers = (await (await page.request.get('/api/admin/users')).json()).users;
      const user = adminUsers.find((record: { email: string }) => record.email === email);
      expect(user.mustChangePassword).toBe(false);
      expect(Object.keys(user)).not.toContain('password');
      expect(Object.keys(user)).not.toContain('password_hash');
    } finally {
      await createdContext.close();
    }
  });

  test('sessão persiste após recarregar e logout remove o acesso ao servidor', async ({ page }) => {
    await loginViaForm(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
    expect((await page.request.get('/api/responses')).status()).toBe(200);
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
    expect((await page.request.get('/api/responses')).status()).toBe(401);
    await page.goto('/#/painel?dados=servidor');
    await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
    await expect(page.locator('.comment')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exportar Excel' })).toHaveCount(0);
  });

  test('erro de conexão mantém o rascunho e a tentativa seguinte usa o mesmo identificador', async ({
    page,
  }) => {
    await completeSectorSurvey(page, 'triagem', `Rascunho fictício de QA ${randomUUID()}`);
    const draft = await page.getByLabel('Seu comentário').inputValue();
    const identifiers: string[] = [];
    await page.route('**/api/responses', async (route) => {
      identifiers.push(route.request().postDataJSON().id);
      if (identifiers.length === 1) await route.abort('internetdisconnected');
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Concluir pesquisa' }).click();
    await page.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Confirmar suas respostas' }).getByRole('alert'),
    ).toContainText('conexão');
    await expect(page.getByLabel('Seu comentário')).toHaveValue(draft);
    await expect(page.getByRole('heading', { name: 'Obrigado por compartilhar.' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Obrigado por compartilhar.' })).toBeVisible();
    expect(identifiers).toHaveLength(2);
    expect(identifiers[1]).toBe(identifiers[0]);
    await authenticate(page.context());
    const records = (await (await page.request.get('/api/responses')).json())
      .responses as SurveyResponse[];
    expect(records.filter((record) => record.id === identifiers[0])).toHaveLength(1);
  });

  test('logout de sessão expirada retorna ao acesso anônimo sem alerta', async ({ page }) => {
    await authenticate(page.context());
    await page.goto('/#/painel?dados=servidor');
    await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atualizar agora' })).toBeEnabled();
    await page.context().clearCookies();
    const logout = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    expect((await logout).status()).toBe(401);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await page.request.get('/api/responses')).status()).toBe(401);
  });

  test('pedido opcional da ouvidoria exige autorização e fica separado das respostas analíticas', async ({
    page,
    browser,
  }) => {
    const marker = `Manifestação sintética ${randomUUID()}`;
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
    await page.getByLabel('Nome para contato', { exact: true }).fill('Paciente fictício de QA');
    await page.getByLabel('Telefone para contato', { exact: true }).fill('51999990000');
    await page.getByLabel('Conte o que aconteceu', { exact: true }).fill(marker);
    await page.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirmar suas respostas' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(/autoriz|consent/i);
    await page
      .getByRole('checkbox', { name: DEFAULT_SETTINGS.contactConsent, exact: true })
      .check();
    await page.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirmar suas respostas' })).toBeVisible();
    const beforeConfirmation = await page.request.get('/api/admin/contacts');
    expect(beforeConfirmation.status()).toBe(401);
    await page.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Obrigado por compartilhar.' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('medicare.responses.v1'))).toBeNull();

    const adminContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
    try {
      await authenticate(adminContext);
      const admin = await adminContext.newPage();
      await admin.goto('/#/ouvidoria');
      await expect(admin.getByText(marker, { exact: true })).toBeVisible();
      const contacts = (await (await admin.request.get('/api/admin/contacts')).json())
        .contacts as ContactRequest[];
      const contact = contacts.find((entry) => entry.message === marker)!;
      expect(contact.email).toBe('');
      expect(contact.status).toBe('novo');
      expect(contact.consentText).toBe(DEFAULT_SETTINGS.contactConsent);
      const responses = (await (await admin.request.get('/api/responses')).json())
        .responses as SurveyResponse[];
      const response = responses.find((entry) => entry.id === contact.surveyId)!;
      expect(response).toBeTruthy();
      expect(JSON.stringify(response)).not.toContain('51999990000');
      expect(JSON.stringify(response)).not.toContain('Paciente fictício de QA');
      expect(JSON.stringify(response)).not.toContain(marker);
      await admin
        .getByLabel('Situação de Paciente fictício de QA', { exact: true })
        .selectOption('em-analise');
      await expect(admin.getByRole('status')).toContainText('Situação da manifestação atualizada');
      await admin.reload();
      await expect(admin.getByText(marker, { exact: true })).toBeVisible();
      await expect(
        admin.getByLabel('Situação de Paciente fictício de QA', { exact: true }),
      ).toHaveValue('em-analise');
    } finally {
      await adminContext.close();
    }
  });

  test('admin publica mensagens personalizadas e novas perguntas gerais', async ({
    page,
    browser,
  }) => {
    await authenticate(page.context());
    const original = (await (await page.request.get('/api/settings')).json()).settings;
    const confirmation = `Confirmação sintética de QA ${randomUUID()}`;
    const success = 'Sua avaliação de teste foi registrada com sucesso.';
    await page.goto('/#/configuracoes');
    await page
      .getByRole('textbox', { name: 'Confirmação de envio', exact: true })
      .fill(confirmation);
    await page.getByRole('textbox', { name: 'Mensagem após envio', exact: true }).fill(success);
    await page.getByRole('button', { name: /Salvar/ }).click();
    await expect(page.getByRole('status')).toContainText(/salv|atualiz/i);
    const newQuestion = `Pergunta geral sintética de QA ${randomUUID()}?`;
    await page.goto('/#/perguntas');
    await page.getByLabel('Setor da pesquisa').selectOption('geral');
    await page.getByLabel('Nova pergunta', { exact: true }).fill(newQuestion);
    await page.getByRole('button', { name: 'Adicionar pergunta', exact: true }).click();
    if (await page.getByRole('button', { name: 'Salvar perguntas', exact: true }).isEnabled()) {
      await page.getByRole('button', { name: 'Salvar perguntas', exact: true }).click();
    }
    await expect
      .poll(async () => {
        const questions = (await (await page.request.get('/api/questions')).json())
          .questions as Question[];
        return questions.some((q) => q.sectorId === 'geral' && q.text === newQuestion);
      })
      .toBe(true);
    const patientContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
    try {
      const patient = await patientContext.newPage();
      await completeSectorSurvey(
        patient,
        'triagem',
        'Resposta fictícia para validar as mensagens.',
      );
      await patient.getByRole('button', { name: 'Concluir pesquisa', exact: true }).click();
      await expect(patient.getByRole('dialog')).toContainText(confirmation);
      await patient.getByRole('button', { name: 'Confirmar envio', exact: true }).click();
      await expect(patient.getByText(success, { exact: true })).toBeVisible();
    } finally {
      await patientContext.close();
      const session = await (await page.request.get('/api/auth/session')).json();
      const current = (await (await page.request.get('/api/settings')).json()).settings;
      const restored = await page.request.put('/api/settings', {
        headers: { Origin: 'http://127.0.0.1:5174', 'x-csrf-token': session.csrfToken },
        data: {
          settings: { ...original, version: current.version },
          expectedVersion: current.version,
        },
      });
      expect(restored.status()).toBe(200);
    }
  });
});
