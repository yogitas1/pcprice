import { test, expect, Page } from "@playwright/test";

// Static, unprotected routes only — protected routes all redirect to /login,
// so clicking within them is equivalent to clicking within /login.
// Dynamic routes (/listings/[id], /catalog/[id]) need real DB IDs and are excluded here.
const ROUTES = [
  "/login",
  "/signup",
];

// Selectors/text fragments to NEVER auto-click (irreversible/destructive/financial actions).
const SKIP_PATTERNS = [
  /delete/i,
  /remove/i,
  /pay\b/i,
  /confirm purchase/i,
  /submit payment/i,
  /place order/i,
  /cancel/i,
  /sign out/i,
  /log out/i,
  /continue with google/i, // navigates to external OAuth — cannot return to localhost
  /continue with/i,        // any other third-party SSO button
];

function shouldSkip(label: string) {
  return SKIP_PATTERNS.some((re) => re.test(label));
}

function attachErrorListeners(page: Page, errors: string[]) {
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("requestfailed", (req) => {
    const url = req.url();
    const err = req.failure()?.errorText;
    // ERR_ABORTED on navigation is expected for:
    //   - Next.js RSC prefetch requests (_rsc=) cancelled when the page navigates
    //   - External OAuth redirects (Google, etc.) that leave localhost
    if (err === "net::ERR_ABORTED" && (url.includes("_rsc=") || !url.startsWith("http://localhost"))) return;
    errors.push(`[requestfailed] ${url} - ${err}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) errors.push(`[http ${res.status()}] ${res.url()}`);
  });
}

for (const route of ROUTES) {
  test(`click-crawl ${route}`, async ({ page }) => {
    const errors: string[] = [];
    attachErrorListeners(page, errors);

    await page.goto(route, { waitUntil: "networkidle" });

    const clickable = await page
      .locator('button, a[href], [role="button"], input[type="submit"]')
      .all();

    let clickedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < clickable.length; i++) {
      // re-query each loop in case the DOM changed after a click
      const elements = await page
        .locator('button, a[href], [role="button"], input[type="submit"]')
        .all();
      const el = elements[i];
      if (!el) continue;

      const label = (await el.innerText().catch(() => "")) || (await el.getAttribute("aria-label")) || "";

      if (shouldSkip(label)) {
        skippedCount++;
        continue;
      }

      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      try {
        await el.click({ timeout: 3000 });
        clickedCount++;
        await page.waitForTimeout(300);
      } catch {
        // click failed (covered, detached, etc.) — not necessarily a bug, skip
        continue;
      }

      // navigate back to the route if the click took us elsewhere
      if (page.url() !== new URL(route, page.url()).toString()) {
        await page.goto(route, { waitUntil: "networkidle" });
      }
    }

    test.info().annotations.push({
      type: "summary",
      description: `${route}: clicked ${clickedCount}, skipped ${skippedCount} (destructive/financial)`,
    });

    expect(errors, `Errors found while click-crawling ${route}:\n${errors.join("\n")}`).toEqual([]);
  });
}
