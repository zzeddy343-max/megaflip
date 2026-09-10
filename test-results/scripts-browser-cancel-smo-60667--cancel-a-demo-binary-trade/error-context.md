# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scripts\browser-cancel-smoke.spec.mjs >> place and cancel a demo binary trade
- Location: scripts\browser-cancel-smoke.spec.mjs:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - img "MEGAFLIP" [ref=e6]
        - generic [ref=e7]: MEGAFLIP
      - paragraph [ref=e8]: Forex · Crypto · Binaries · Polymarket · Aviator
    - generic [ref=e9]:
      - generic [ref=e10]:
        - button "Sign in" [ref=e11]
        - button "Create account" [ref=e12]
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: Full name
          - textbox "Full name" [ref=e16]:
            - /placeholder: Jane Doe
            - text: Codex Trade Test
        - generic [ref=e17]:
          - generic [ref=e18]: Safaricom number
          - textbox "Safaricom number" [ref=e19]:
            - /placeholder: "0712345678"
            - text: "0712345678"
        - generic [ref=e20]:
          - generic [ref=e21]: Email
          - textbox "Email" [ref=e22]:
            - /placeholder: you@email.com
            - text: codex-trade-1784872119137@example.com
        - generic [ref=e23]:
          - generic [ref=e24]: Password
          - generic [ref=e25]:
            - textbox "Password Toggle password" [ref=e26]:
              - /placeholder: Min 8, 1 uppercase, 1 number
              - text: TestPass1
            - button "Toggle password" [ref=e27]:
              - img [ref=e28]
        - generic [ref=e33]:
          - generic [ref=e34]: Confirm password
          - generic [ref=e35]:
            - textbox "Confirm password Toggle confirm" [ref=e36]:
              - /placeholder: Repeat password
              - text: TestPass1
            - button "Toggle confirm" [active] [ref=e37]:
              - img [ref=e38]
        - generic [ref=e43]:
          - generic [ref=e44]: Referral code (optional)
          - textbox "Referral code (optional)" [ref=e45]:
            - /placeholder: e.g. AGENT123
        - button "Create account" [ref=e46]
      - paragraph [ref=e47]: By continuing you agree to our terms. Trading involves risk.
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("place and cancel a demo binary trade", async ({ page }) => {
  4  |   const logs = [];
  5  |   page.on("console", (msg) => logs.push(`[console ${msg.type()}] ${msg.text()}`));
  6  |   page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
  7  | 
  8  |   const email = `codex-trade-${Date.now()}@example.com`;
  9  |   const password = "TestPass1";
  10 | 
  11 |   await page.goto("http://127.0.0.1:3000/auth");
  12 |   await page.getByRole("button", { name: /create account/i }).first().click();
  13 |   await page.getByLabel(/full name/i).fill("Codex Trade Test");
  14 |   await page.getByLabel(/safaricom/i).fill("0712345678");
  15 |   await page.getByLabel(/^email$/i).fill(email);
  16 |   await page.getByLabel(/^password$/i).fill(password);
  17 |   await page.getByLabel(/confirm password/i).fill(password);
  18 |   await page.getByRole("button", { name: /create account/i }).last().click();
> 19 |   await page.waitForURL(/\/binary/, { timeout: 30000 });
     |              ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  20 |   await page.waitForTimeout(2500);
  21 | 
  22 |   await page
  23 |     .locator("button")
  24 |     .filter({ hasText: /\$0\.00|\$10000\.00|\$10,000\.00/ })
  25 |     .first()
  26 |     .click();
  27 |   await page.getByText(/Demo USD/i).click();
  28 |   await page.waitForTimeout(1500);
  29 | 
  30 |   await page.getByRole("button", { name: /10t/i }).click();
  31 |   await page.getByRole("button").filter({ hasText: /Even/i }).last().click();
  32 |   await page.waitForTimeout(1200);
  33 | 
  34 |   await page.goto("http://127.0.0.1:3000/positions");
  35 |   await page.waitForTimeout(2500);
  36 |   const cancel = page.getByRole("button", { name: /cancel/i }).first();
  37 |   await cancel.waitFor({ state: "visible", timeout: 15000 });
  38 |   await cancel.click();
  39 |   await page.waitForTimeout(3500);
  40 | 
  41 |   const body = await page.locator("body").innerText();
  42 |   console.log(JSON.stringify({ email, excerpt: body.slice(0, 1200), logs: logs.slice(-20) }));
  43 | 
  44 |   expect(body).toMatch(/Trade cancelled|Contract cancelled|Closed \(/i);
  45 |   expect(body).not.toMatch(/invalid input value for enum trade_status|Could not settle trade with fallback/i);
  46 | });
  47 | 
```