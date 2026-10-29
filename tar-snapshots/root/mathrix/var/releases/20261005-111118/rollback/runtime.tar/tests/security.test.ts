import { test } from "node:test";
import assert from "node:assert/strict";
import { safeURL, parseCookies, validOrigin } from "../lib/security";
test("campaign links reject script, data, private and credential URLs", () => {
  for (const u of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://localhost",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "https://a:b@example.com",
    "http://172.16.0.1",
  ])
    assert.throws(() => safeURL(u));
  assert.equal(safeURL("https://mathrix.app/play"), "https://mathrix.app/play");
  assert.equal(safeURL("", true), "");
});
test("cookies parse embedded equals and Origin check is exact", () => {
  assert.deepEqual(parseCookies("a=abc=def; b=123"), {
    a: "abc=def",
    b: "123",
  });
  assert.equal(validOrigin("https://mathrix.app", "https://mathrix.app"), true);
  assert.equal(
    validOrigin("https://mathrix.app.evil.test", "https://mathrix.app"),
    false,
  );
  assert.equal(validOrigin(undefined, "https://mathrix.app"), false);
});
