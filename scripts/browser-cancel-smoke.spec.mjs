import { test, expect } from "@playwright/test";

test("place and cancel a demo binary trade", async ({ page }) => {
  const logs = [];
  page.on("console", (msg) => logs.push(`[console ${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

  const email = `codex-trade-${Date.now()}@example.com`;
  const password = "TestPass1";

  await page.goto("http://127.0.0.1:3000/auth");
  await page.getByRole("button", { name: /create account/i }).first().click();
  await page.getByLabel(/full name/i).fill("Codex Trade Test");
  await page.getByLabel(/safaricom/i).fill("0712345678");
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/confirm password/i).fill(password);
  await page.getByRole("button", { name: /create account/i }).last().click();
  await page.waitForURL(/\/binary/, { timeout: 30000 });
  await page.waitForTimeout(2500);

  await page
    .locator("button")
    .filter({ hasText: /\$0\.00|\$10000\.00|\$10,000\.00/ })
    .first()
    .click();
  await page.getByText(/Demo USD/i).click();
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: /10t/i }).click();
  await page.getByRole("button").filter({ hasText: /Even/i }).last().click();
  await page.waitForTimeout(1200);

  await page.goto("http://127.0.0.1:3000/positions");
  await page.waitForTimeout(2500);
  const cancel = page.getByRole("button", { name: /cancel/i }).first();
  await cancel.waitFor({ state: "visible", timeout: 15000 });
  await cancel.click();
  await page.waitForTimeout(3500);

  const body = await page.locator("body").innerText();
  console.log(JSON.stringify({ email, excerpt: body.slice(0, 1200), logs: logs.slice(-20) }));

  expect(body).toMatch(/Trade cancelled|Contract cancelled|Closed \(/i);
  expect(body).not.toMatch(/invalid input value for enum trade_status|Could not settle trade with fallback/i);
});
