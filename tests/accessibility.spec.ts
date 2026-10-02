import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('formulário e painel atendem à verificação automática de acessibilidade', async ({ page }) => {
  for (const route of ['/', '/pesquisas', '/perguntas', '/qualidade', '/pesquisa/triagem']) {
    await page.goto(`/#${route}`);
    if (route === '/pesquisa/triagem')
      await page.getByRole('button', { name: 'Começar pesquisa' }).click();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      result.violations,
      `${route}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
});

test('pesquisa utilizável em 320px e com fonte ampliada', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#/pesquisa/triagem');
  await page.getByRole('button', { name: 'Começar pesquisa' }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
});
