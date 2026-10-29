import { browserSession } from "./auth-fixture";
import { test, expect } from "@playwright/test";

test("admin email settings persist, refresh keeps drafts, and manual emails require confirmation", async ({
  page,
}) => {
  test.setTimeout(120000);
  test.skip(
    !process.env.DATABASE_URL ||
      !new URL(process.env.DATABASE_URL).pathname.includes("_test_"),
    "Email settings require the isolated system-test database.",
  );
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  await browserSession(page.context(), {
    email: "admin1@mathrix.app",
    role: "ADMIN",
  });
  const response = await page.request.get("/api/admin/email");
  expect(response.ok(), await response.text()).toBe(true);
  const original = await response.json();
  expect(original.configured).toBe(false);
  const { nextRunAt: _, ...restore } = original.weekly;
  void _;
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Emails", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Community emails" }),
    ).toBeVisible();
    const setupWarning = page
      .getByRole("alert")
      .filter({ hasText: "Email sending needs setup." });
    await expect(setupWarning).toBeVisible();
    const send = page.getByRole("button", {
      name: /^Send to \d[\d,]* players$/,
    });
    await expect(send).toBeDisabled();
    await page.getByLabel("Enable weekly reminder").check();
    await page.getByLabel("Send day").selectOption("2");
    await page.getByLabel("Send hour (UTC)").selectOption("14");
    await page
      .getByLabel("Weekly email subject")
      .fill("We miss you at Mathrix");
    await page
      .getByLabel("Weekly email message")
      .fill("Come back for a quick game this week.");
    await page
      .getByRole("button", { name: "Save weekly reminder", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Weekly reminder saved.",
    );
    await page.reload();
    await page.getByRole("button", { name: "Emails", exact: true }).click();
    await expect(page.getByLabel("Weekly email subject")).toHaveValue(
      "We miss you at Mathrix",
    );
    await expect(page.getByLabel("Weekly email message")).toHaveValue(
      "Come back for a quick game this week.",
    );
    await expect(page.getByLabel("Send day")).toHaveValue("2");
    await expect(page.getByLabel("Send hour (UTC)")).toHaveValue("14");

    const manualSubject = page.getByLabel("Manual email subject");
    const manualMessage = page.getByLabel("Manual email message");
    await manualSubject.fill("Community game night");
    await manualMessage.fill("Join us for a game tonight.");
    await page.getByLabel("Weekly email subject").fill("Unsaved weekly draft");
    await page
      .getByRole("button", { name: "Refresh emails", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh emails", exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Weekly email subject")).toHaveValue(
      "Unsaved weekly draft",
    );
    await expect(manualSubject).toHaveValue("Community game night");
    await expect(manualMessage).toHaveValue("Join us for a game tonight.");

    let sends = 0,
      finished = false;
    const at = new Date().toISOString();
    await page.route("**/api/admin/email", (route) =>
      route.fulfill({
        json: {
          ...original,
          configured: true,
          missing: [],
          recipientCount: 3,
          campaigns: sends
            ? [
                {
                  id: "browser-email-preview",
                  kind: "manual",
                  subject: "Community game night",
                  status: finished ? "completed" : "sending",
                  total: 3,
                  sent: finished ? 3 : 1,
                  failed: 0,
                  createdAt: at,
                  finishedAt: finished ? at : null,
                },
              ]
            : [],
        },
      }),
    );
    await page.route("**/api/admin/email/send", (route) => {
      sends++;
      expect(route.request().postDataJSON()).toEqual({
        subject: "Community game night",
        body: "Join us for a game tonight.",
      });
      return route.fulfill({
        status: 202,
        json: { id: "browser-email-preview" },
      });
    });
    await page
      .getByRole("button", { name: "Refresh emails", exact: true })
      .click();
    await expect(send).toBeEnabled();
    await expect(setupWarning).toHaveCount(0);
    await expect(
      page.getByText("Email sending is ready.", { exact: true }),
    ).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("all 3 eligible players");
      await dialog.dismiss();
    });
    await send.click();
    expect(sends).toBe(0);
    await expect(manualSubject).toHaveValue("Community game night");
    await page.clock.install();
    page.once("dialog", (dialog) => dialog.accept());
    await send.click();
    await expect(page.getByRole("status")).toContainText(
      "Community email queued.",
    );
    expect(sends).toBe(1);
    await expect(manualSubject).toHaveValue("");
    const history = page
      .getByRole("row")
      .filter({ hasText: "Community game night" });
    await expect(history).toContainText("1 / 3 sent");
    finished = true;
    await page.clock.fastForward(5500);
    await expect(history).toContainText("completed");
    await expect(history).toContainText("3 / 3 sent");
    await page.screenshot({
      path: "/root/mathrix/var/email-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/root/mathrix/var/email-mobile.png",
      fullPage: true,
    });
  } finally {
    const restored = await page.request.post("/api/admin/email", {
      headers: { Origin: origin },
      data: restore,
    });
    expect(restored.ok(), await restored.text()).toBe(true);
  }
});
