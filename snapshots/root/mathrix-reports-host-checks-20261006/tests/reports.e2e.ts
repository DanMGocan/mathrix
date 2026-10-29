import { expect, test } from "@playwright/test";

test("footer reports validate, retain failed drafts, and confirm successful saves", async ({
  page,
}) => {
  await page.route("**/api/me", (route) => route.fulfill({ json: null }));
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.locator("footer").screenshot({
      path: test.info().outputPath(`footer-${width}.png`),
    });
    for (const [label, endpoint] of [
      ["Report a bug", "/api/bug-reports"],
      ["Send feedback", "/api/feedback"],
    ]) {
      const trigger = page
        .locator("footer")
        .getByRole("button", { name: label });
      await expect(trigger.locator("svg")).toBeVisible();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: label });
      const title = dialog.getByLabel("Title", { exact: true });
      const message = dialog.getByLabel("Message", { exact: true });
      await expect(title).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      const send = dialog.getByRole("button", { name: /^Send / });
      let attempts = 0;
      let finishSave = () => {};
      await page.route(`**${endpoint}`, async (route) => {
        attempts++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({
          title: "Example title",
          message: "Example message",
        });
        if (attempts === 1) {
          await route.fulfill({
            status: 503,
            json: { error: "Could not save. Try again." },
          });
        } else {
          await new Promise<void>((resolve) => {
            finishSave = resolve;
          });
          await route.fulfill({ status: 201, json: { ok: true } });
        }
      });
      await send.click();
      expect(attempts).toBe(0);
      await title.fill("   ");
      await message.fill("   ");
      await send.click();
      await expect(dialog.getByRole("alert")).toHaveText(
        "Enter a title and message before sending.",
      );
      expect(attempts).toBe(0);
      await title.fill(" Example title ");
      await message.fill(" Example message ");
      await send.click();
      await expect(dialog.getByRole("alert")).toHaveText(
        "Could not save. Try again.",
      );
      await expect(title).toHaveValue(" Example title ");
      await expect(message).toHaveValue(" Example message ");
      await page.screenshot({
        path: test.info().outputPath(`${endpoint.slice(5)}-${width}-error.png`),
        fullPage: true,
      });
      await send.click();
      await expect(
        dialog.getByRole("button", { name: "Sending…" }),
      ).toBeDisabled();
      await expect(title).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect.poll(() => attempts).toBe(2);
      await page.screenshot({
        path: test.info().outputPath(`${endpoint.slice(5)}-${width}-sending.png`),
        fullPage: true,
      });
      finishSave();
      await expect(dialog.getByRole("status")).toContainText("has been saved.");
      await page.screenshot({
        path: test.info().outputPath(`${endpoint.slice(5)}-${width}-success.png`),
        fullPage: true,
      });
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(title).toHaveValue("");
      await expect(message).toHaveValue("");
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`${endpoint.slice(5)}-${width}.png`),
        fullPage: true,
      });
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await page.unroute(`**${endpoint}`);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
