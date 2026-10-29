import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

test("admin uploads design references, downloads originals, and preserves duplicate errors", async ({
  page,
}) => {
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  const login = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "admin2@mathrix.app", password: "amdin" },
    headers: { Origin: origin },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Design files", exact: true }).click();
  const filename = `design-${randomUUID()}.png`;
  const bytes = Buffer.concat([
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
    Buffer.alloc(40 * 1024),
  ]);
  await page
    .getByLabel("Design file", { exact: true })
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: bytes });
  await page
    .getByLabel("Description", { exact: true })
    .fill("Reference for the homepage\nKeep the navigation.");
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`Uploaded ${filename}`);
  await page.reload();
  await page.getByRole("button", { name: "Design files", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: filename });
  await expect(row).toContainText("Reference for the homepage");
  const downloadEvent = page.waitForEvent("download");
  await row.getByRole("link", { name: `Download ${filename}` }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(filename);
  expect(await readFile((await download.path())!)).toEqual(bytes);
  await page
    .getByLabel("Design file", { exact: true })
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: bytes });
  await page
    .getByLabel("Description", { exact: true })
    .fill("A replacement that must not save");
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "filename already exists",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "A replacement that must not save",
  );
  expect(
    await page
      .getByLabel("Design file", { exact: true })
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe(filename);
  await expect(row).toContainText("Reference for the homepage");
});
