// SPDX-License-Identifier: MIT
import { test, expect } from '@playwright/test';
import { installFreighterStub, installNetworkStubs, MOCK_PUBLIC_KEY, MOCK_TX_HASH } from './stubs';

test.describe('Burn Tokens flow', () => {
  test('submits a valid burn amount and shows success alert', async ({ page }) => {
    await installFreighterStub(page, MOCK_PUBLIC_KEY);
    await installNetworkStubs(page, { balance: 1000n });

    await page.goto('/#/');
    await page.getByTestId('connect-freighter').click();
    await expect(page.getByTestId('connected-wallet')).toBeVisible();

    await page.goto('/#/burn');

    // Heading assertion - must fail if missing
    await expect(page.getByRole('heading', { name: 'Burn Tokens' })).toBeVisible();

    // Fill amount and submit
    await page.locator('#burn-amount').fill('100');

    const submitBtn = page.getByTestId('burn-submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Assert success state
    const successAlert = page.getByTestId('burn-success');
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText(MOCK_TX_HASH);
  });

  test('disables submit button when burn amount exceeds mocked balance', async ({ page }) => {
    await installFreighterStub(page, MOCK_PUBLIC_KEY);
    await installNetworkStubs(page, { balance: 300n });

    await page.goto('/#/');
    await page.getByTestId('connect-freighter').click();
    await expect(page.getByTestId('connected-wallet')).toBeVisible();

    await page.goto('/#/burn');

    await expect(page.getByRole('heading', { name: 'Burn Tokens' })).toBeVisible();

    await page.locator('#burn-amount').fill('500');

    // Over-balance warning and disabled submit button assertion
    await expect(page.getByTestId('burn-over-balance')).toBeVisible();
    const submitBtn = page.getByTestId('burn-submit');
    await expect(submitBtn).toBeDisabled();
  });
});

test.describe('BurnScreen Safety Modal & Execution Flow (#1254)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/burn');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should keep confirm button disabled until safety confirmation checkbox is checked', async ({ page }) => {
    // 1. Enter burn amount
    const burnInput = page.locator('input[name="burnAmount"], [data-testid="burn-amount-input"]');
    await expect(burnInput).toBeVisible();
    await burnInput.fill('50.00');

    // 2. Open safety confirmation modal
    const initiateBurnBtn = page.locator('button:has-text("Burn Tokens"), [data-testid="initiate-burn-btn"]');
    await initiateBurnBtn.click();

    // 3. Assert confirmation modal appears
    const safetyModal = page.locator('[data-testid="burn-safety-modal"], text=Irreversible Action');
    await expect(safetyModal).toBeVisible();

    // 4. Assert confirm button is disabled initially
    const confirmBurnBtn = page.locator('[data-testid="confirm-burn-submit-btn"], button:has-text("Confirm Burn")');
    await expect(confirmBurnBtn).toBeDisabled();

    // 5. Check irreversible warning checkbox
    const safetyCheckbox = page.locator('input[type="checkbox"][name="irreversibleWarning"], [data-testid="burn-safety-checkbox"]');
    await safetyCheckbox.check();

    // 6. Assert confirm button is now enabled
    await expect(confirmBurnBtn).toBeEnabled();
  });

  test('should execute burn and verify supply decrement success alert', async ({ page }) => {
    // Enter burn amount
    const burnInput = page.locator('input[name="burnAmount"], [data-testid="burn-amount-input"]');
    await burnInput.fill('25.00');

    // Initiate burn
    const initiateBurnBtn = page.locator('button:has-text("Burn Tokens"), [data-testid="initiate-burn-btn"]');
    await initiateBurnBtn.click();

    // Check safety modal checkbox & submit
    const safetyCheckbox = page.locator('input[type="checkbox"][name="irreversibleWarning"], [data-testid="burn-safety-checkbox"]');
    await safetyCheckbox.check();

    const confirmBurnBtn = page.locator('[data-testid="confirm-burn-submit-btn"], button:has-text("Confirm Burn")');
    await confirmBurnBtn.click();

    // Verify supply decrement success notification / alert
    const successAlert = page.locator('text=Burn Successful, text=Total Supply Updated, [data-testid="burn-success-alert"]');
    await expect(successAlert).toBeVisible({ timeout: 15000 });
  });

  test('should pass automated WCAG 2.1 AA accessibility audit on BurnScreen', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.error('Accessibility violations found on BurnScreen:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});