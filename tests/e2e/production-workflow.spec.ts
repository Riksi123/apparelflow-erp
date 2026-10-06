import { expect, test, type Page } from "@playwright/test";

const password = process.env.DEMO_PASSWORD;

const accounts = {
  cutting: "cutting.supervisor@apparelflow.local",
  verifier: "cutting.verifier@apparelflow.local",
  sewing: "sewing.supervisor@apparelflow.local",
};

async function signIn(page: Page, email: string) {
  if (!password) throw new Error("Set DEMO_PASSWORD to the password used by the demo account seed.");
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function signOut(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function createBlouseOrder(page: Page, fabricRollId: string) {
  await page.goto("/cutting");
  await page.getByLabel("Production recipe").selectOption({ label: "Casual Blouse · REC-BL01" });
  await page.getByLabel(/Target batch quantity/).fill("2");
  await page.getByLabel("Fabric roll ID").fill(fabricRollId);
  await page.getByLabel("Actual fabric used (yards)", { exact: false }).fill("3.96");
  await page.getByRole("button", { name: "Create and send to verification" }).click();
  const message = await page.getByRole("status").textContent();
  const orderNo = message?.match(/AF-[A-Z0-9]+/)?.[0];
  expect(orderNo).toBeTruthy();
  return orderNo!;
}

async function countAllComponents(page: Page, makeShortage = false) {
  const rows = page.locator("tbody tr");
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i);
    const expected = Number(await row.locator("td").nth(0).textContent());
    await row.locator('input[type="number"]').fill(String(makeShortage && i === 0 ? expected - 1 : expected));
  }
}

test("a GREEN batch is approved, survives reload, and starts in sewing", async ({ page }) => {
  await signIn(page, accounts.cutting);
  const orderNo = await createBlouseOrder(page, `FAB-E2E-${Date.now()}`);

  await signOut(page);
  await signIn(page, accounts.verifier);
  await page.goto("/verification");
  await page.getByRole("button", { name: new RegExp(orderNo) }).click();
  await countAllComponents(page);
  await page.getByRole("button", { name: "Approve batch" }).click();
  await expect(page.getByRole("status")).toContainText(`${orderNo} approved`);

  await signOut(page);
  await signIn(page, accounts.sewing);
  await page.goto("/sewing");
  await expect(page.getByRole("button", { name: new RegExp(orderNo) })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(orderNo) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(orderNo) }).click();
  await expect(page.getByRole("heading", { name: "Verification audit" })).toBeVisible();
  await expect(page.getByText("Verified by", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Start sewing assembly" }).click();
  await expect(page.getByRole("status")).toContainText(`${orderNo} started sewing`);
  await expect(page.getByRole("button", { name: new RegExp(orderNo) })).toHaveCount(0);
});

test("a RED shortage blocks approval and records rejection feedback for re-cut", async ({ page }) => {
  await signIn(page, accounts.cutting);
  const orderNo = await createBlouseOrder(page, `FAB-RED-${Date.now()}`);

  await signOut(page);
  await signIn(page, accounts.verifier);
  await page.goto("/verification");
  await page.getByRole("button", { name: new RegExp(orderNo) }).click();
  await countAllComponents(page, true);
  await expect(page.getByRole("button", { name: "Approve batch" })).toBeDisabled();
  await page.getByRole("button", { name: "Reject batch" }).click();
  await page.getByLabel("Rejection reason").fill("Front panel shortage; recut required");
  await page.getByRole("button", { name: "Confirm rejection" }).click();

  await signOut(page);
  await signIn(page, accounts.cutting);
  await page.goto("/cutting");
  await expect(page.getByText("Front panel shortage; recut required")).toBeVisible();
  await page.getByLabel(`Fabric roll ID`, { exact: true }).last().fill(`FAB-REWORK-${Date.now()}`);
  await page.getByLabel("Actual fabric used (yards)").last().fill("4.1");
  await page.getByRole("button", { name: "Begin re-cutting" }).click();
  await page.getByRole("button", { name: "Submit re-cut to verification" }).click();
  await expect(page.getByRole("status")).toContainText(`${orderNo} was sent back to verification`);
});
