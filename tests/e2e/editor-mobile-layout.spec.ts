import { expect, test } from '@playwright/test';

for (const width of [320, 390, 560, 768, 1280]) {
  test(`editor controls fit within a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('button[data-tab="editor"]').click();
    await expect(page.locator('#editor-canvas')).toBeVisible();

    const expectNoPageOverflow = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    };
    await expectNoPageOverflow();

    for (const id of ['btn-manual-save', 'btn-history-dropdown', 'btn-plugins', 'btn-devlog']) {
      const button = page.locator(`#${id}`);
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await button.evaluate(element => {
        const label = document.createRange();
        label.selectNodeContents(element.querySelector('[data-text-key]') ?? element);
        const text = label.getBoundingClientRect();
        const button = element.getBoundingClientRect();
        return text.left >= button.left && text.right <= button.right;
      })).toBe(true);
    }

    await page.locator('#btn-history-dropdown').click();
    const menu = page.locator('#history-dropdown-menu');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expectNoPageOverflow();

    await page.locator('button[data-tab="game"]').click();
    await expect(page.locator('#btn-manual-save')).toBeHidden();
    await expect(page.locator('.project-save-controls')).toBeHidden();
    await expectNoPageOverflow();
  });
}
