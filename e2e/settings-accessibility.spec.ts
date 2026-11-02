import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

test('keeps settings and the last option inside narrow and short viewports', async ({ page }) => {
  await page.goto('./');
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 640, height: 360 }
  ]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: '比对设置', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '比对设置', exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 8);

    const ignore = dialog.locator('.settings-toggle').filter({ hasText: '差异忽略' });
    if ((await ignore.getAttribute('aria-pressed')) === 'false') await ignore.click();
    const lastOption = dialog.locator('.similar-level-segmented [role="radio"]').last();
    await lastOption.scrollIntoViewIfNeeded();
    await expect(lastOption).toBeInViewport();
    const optionBounds = await lastOption.boundingBox();
    expect(optionBounds!.x).toBeGreaterThanOrEqual(8);
    expect(optionBounds!.x + optionBounds!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(optionBounds!.y + optionBounds!.height).toBeLessThanOrEqual(viewport.height - 8);
    await lastOption.click();
    await expect(lastOption).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test('navigates setting radio groups with one tab stop and keeps focus in the dialog', async ({
  page,
  browserName
}) => {
  // macOS WebKit follows the system preference for tabbing to buttons.
  // Option+Tab includes all controls, which lets us verify the complete order.
  const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '比对设置', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '比对设置', exact: true });
  const granularity = dialog.getByRole('radiogroup', { name: '比对粒度', exact: true });
  const checked = granularity.locator('[aria-checked="true"]');
  await expect(checked).toHaveAttribute('tabindex', '0');
  await expect(granularity.locator('[tabindex="0"]')).toHaveCount(1);
  await checked.focus();
  await page.keyboard.press('ArrowRight');
  await expect(checked).toHaveText('语义');
  await expect(checked).toBeFocused();
  await page.keyboard.press('End');
  await expect(checked).toHaveText('字符');
  await page.keyboard.press('Home');
  await expect(checked).toHaveText('语义');
  await page.keyboard.press(tab);
  await expect(dialog.locator('.settings-toggle').first()).toBeFocused();

  const colors = dialog.getByRole('radiogroup', { name: '主题色', exact: true });
  await colors.locator('[aria-checked="true"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(colors.locator('[aria-checked="true"]')).toHaveAccessibleName('蓝色');
  await expect(colors.locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press(tab);
  await expect(dialog.locator('.settings-toggle').filter({ hasText: '差异地图' })).toBeFocused();

  await dialog.locator('.settings-toggle').filter({ hasText: '差异忽略' }).click();
  const levels = dialog.locator('.similar-level-segmented');
  await levels.locator('[aria-checked="true"]').focus();
  await page.keyboard.press('End');
  await expect(levels.locator('[aria-checked="true"]')).toHaveText('宽松');
  await expect(levels.locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press(tab);
  await expect(dialog.locator('.settings-reset-button')).toBeFocused();
  await page.keyboard.press('Shift+' + tab);
  await expect(levels.locator('[aria-checked="true"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(levels.locator('[aria-checked="true"]')).toHaveText('关闭');
  await page.keyboard.press(tab);
  await expect(dialog.locator('.settings-reset-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
