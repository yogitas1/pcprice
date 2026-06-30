import { test, expect, Page } from "@playwright/test";

// All real routes in the app. Protected routes redirect to /login (still HTTP 200).
// Dynamic routes (/listings/[id], /catalog/[id], etc.) are not listed here —
// they require real DB IDs and are tested separately with fixtures.
const ROUTES = [
  // Unprotected
  "/login",
  "/signup",
  "/auth/callback",
  // Root — redirects to /dashboard/inventory
  "/",
  // Dashboard (all protected; redirect to /login without a session cookie → 200)
  "/dashboard",
  "/dashboard/inventory",
  "/dashboard/inventory/new",
  "/dashboard/market",
  "/dashboard/buy-orders",
  "/dashboard/buy-orders/new",
  "/dashboard/wallet",
  "/dashboard/settings",
  "/dashboard/settings/payouts",
  "/dashboard/settings/reputation",
  // Admin (protected, admin-gated at runtime)
  "/admin",
  "/admin/events",
  "/admin/appeals",
  "/admin/review",
];

function attachErrorListeners(page: Page, errors: string[]) {
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      errors.push(`[console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    errors.push(`[requestfailed] ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      errors.push(`[http ${res.status()}] ${res.url()}`);
    }
  });
}

for (const route of ROUTES) {
  test(`route ${route} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    attachErrorListeners(page, errors);

    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status(), `${route} returned a bad status`).toBeLessThan(400);

    // give client-side hydration / async fetches a beat to settle
    await page.waitForTimeout(500);

    expect(errors, `Errors on ${route}:\n${errors.join("\n")}`).toEqual([]);
  });
}
