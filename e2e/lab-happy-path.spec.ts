import { test, expect } from "@playwright/test";
import { collectSample, getVerifyReport, loginApi } from "./helpers/api";

const DEMO = {
  tenant: "demo",
  password: "DemoPass123!",
  labtech: "labtech@demo.local",
  pathologist: "pathologist@demo.local"
};

const uniquePatient = () => ({
  name: `E2E Patient ${Date.now()}`,
  mobile: `98${String(Date.now()).slice(-8)}`
});

test.describe("Lab happy path", () => {
  test("book → barcode → receive → results → pathologist sign-off → PDF verify", async ({ page }) => {
    const patient = uniquePatient();
    let barcode = "";
    let orderId = "";

    await page.goto("/login");
    await page.selectOption("#tenantId", DEMO.tenant);
    await page.fill("#email", DEMO.labtech);
    await page.fill("#password", DEMO.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/orders");
    await page.getByPlaceholder("Search mobile / UHID / name").fill(patient.mobile);
    await page.getByLabel("Name", { exact: true }).fill(patient.name);
    await page.getByLabel("Mobile", { exact: true }).fill(patient.mobile);
    await page.getByLabel("Gender", { exact: true }).selectOption("MALE");
    await page.getByLabel("Age", { exact: true }).fill("40");

    await page.getByPlaceholder("Filter catalog").fill("Liver Function");
    await page.locator("tr", { hasText: "Liver Function Test (LFT)" }).getByRole("button", { name: "Add" }).click();
    await page.getByPlaceholder("Filter catalog").fill("Kidney Function");
    await page.locator("tr", { hasText: "Kidney Function Test (KFT)" }).getByRole("button", { name: "Add" }).click();

    await page.getByRole("button", { name: "Book order & generate barcodes" }).click();
    await expect(page.getByText(/booked/i)).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("dialog")).toBeVisible();
    const barcodeEl = page.locator(".tube-sticker svg text, .tube-sticker").first();
    await expect(barcodeEl).toBeVisible();
    barcode =
      (await page.locator(".tube-sticker svg text").first().textContent())?.trim() ??
      (await page.locator(".tube-sticker").first().textContent())?.match(/ORD-[A-Z0-9-]+-[A-Z]+-\d+/i)?.[0] ??
      "";
    expect(barcode.length).toBeGreaterThan(5);
    await page.getByRole("button", { name: "Close" }).click();

    const labSession = await loginApi(DEMO.labtech);
    const collected = await collectSample(labSession.accessToken, barcode);
    orderId = collected.orderId;

    await page.goto("/lab-receiving");
    await page.getByPlaceholder(/Scan or type barcode/i).fill(barcode);
    await page.getByRole("button", { name: "Receive sample" }).click();
    await expect(page.getByText(/RECEIVED_IN_LAB/i)).toBeVisible();

    await page.goto("/lab-results");
    await page.getByLabel("Department").selectOption("Liver Function Test (LFT)");
    await page.waitForTimeout(1200);
    const pendingSelect = page.getByLabel("Pending result");
    if ((await pendingSelect.locator("option").count()) > 1) {
      await pendingSelect.selectOption({ index: 1 });
    }

    await fillResultByParam(page, "Bilirubin Total", "1.0");
    await fillResultByParam(page, "Bilirubin Direct", "0.3");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(rowInput(page, "Bilirubin Indirect")).toHaveValue(/0\.7/);

    await fillResultByParam(page, "Total Protein", "7.0");
    await fillResultByParam(page, "Albumin", "4.0");
    await fillResultByParam(page, "SGOT (AST)", "25");
    await fillResultByParam(page, "SGPT (ALT)", "30");
    await fillResultByParam(page, "Alkaline Phosphatase", "80");
    await page.getByRole("button", { name: "Technician approve" }).click();
    await expect(page.getByText(/pathologist queue/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Department").selectOption("Kidney Function Test (KFT)");
    await page.waitForTimeout(1000);
    if ((await pendingSelect.locator("option").count()) > 1) {
      await pendingSelect.selectOption({ index: 1 });
    }
    await fillResultByParam(page, "Serum Creatinine", "1.0");
    await fillResultByParam(page, "Urea", "25");
    await fillResultByParam(page, "Uric Acid", "5.5");
    await fillResultByParam(page, "Sodium (Na)", "140");
    await fillResultByParam(page, "Potassium (K)", "4.2");
    await fillResultByParam(page, "Chloride (Cl)", "102");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(rowInput(page, "eGFR")).toHaveValue(/97\.2/);
    await page.getByRole("button", { name: "Technician approve" }).click();

    await page.goto("/login");
    await page.selectOption("#tenantId", DEMO.tenant);
    await page.fill("#email", DEMO.pathologist);
    await page.fill("#password", DEMO.password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await page.goto("/pathologist");
    await expect(page.getByText(/Queue/i)).toBeVisible();
    await page.locator(".pathologist-queue-item button.linkish").first().click();
    await page.getByRole("button", { name: /Approve & sign/i }).click();
    await expect(page.getByText(/Verified|NABL PDF/i)).toBeVisible({ timeout: 30_000 });

    const verify = await getVerifyReport(orderId);
    expect(verify.data?.valid ?? verify.success).toBeTruthy();
  });
});

const rowInput = (page: import("@playwright/test").Page, paramName: string) =>
  page.locator("tr", { hasText: paramName }).locator("input").first();

const fillResultByParam = async (page: import("@playwright/test").Page, paramName: string, value: string) => {
  await rowInput(page, paramName).fill(value);
};
