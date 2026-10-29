import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import {
  DesignFileError,
  listDesignFiles,
  uploadDesignFile,
  downloadDesignFile,
} from "../server/design-files";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
async function request(
  filename = "homepage.png",
  bytes: Uint8Array = png,
  type = "image/png",
  description = "Homepage reference",
) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], filename, { type }));
  form.append("description", description);
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: form,
  });
  return Object.assign(
    Readable.from([Buffer.from(await request.arrayBuffer())]),
    {
      headers: { "content-type": request.headers.get("content-type")! },
    },
  ) as unknown as IncomingMessage;
}
const status = (code: number) => (error: unknown) =>
  error instanceof DesignFileError && error.status === code;

test("design uploads persist original bytes and metadata, reject duplicates atomically, and clean failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mathrix-designs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.deepEqual(await listDesignFiles(directory), []);
  const filename = "Homepage – designer's draft.png";
  const saved = await uploadDesignFile(
    await request(filename),
    directory,
    "admin-id",
  );
  assert.equal(saved.filename, filename);
  assert.equal(saved.description, "Homepage reference");
  assert.equal(saved.uploadedBy, "admin-id");
  assert.equal(saved.size, png.length);
  assert.equal(
    (await stat(join(directory, filename, filename))).mode & 0o777,
    0o600,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(join(directory, filename, "metadata.json"), "utf8"),
    ),
    saved,
  );
  // A fresh read must recover everything from disk, without an in-memory index.
  assert.deepEqual(await listDesignFiles(directory), [saved]);
  assert.deepEqual((await downloadDesignFile(directory, filename)).bytes, png);
  await assert.rejects(
    uploadDesignFile(
      await request(filename, png, "image/png", "Replacement"),
      directory,
      "other-admin",
    ),
    status(409),
  );
  assert.deepEqual(
    (await downloadDesignFile(directory, filename)).metadata,
    saved,
  );
  const contenders = await Promise.all([
    request("race.png"),
    request("race.png"),
  ]);
  const results = await Promise.allSettled(
    contenders.map((req) => uploadDesignFile(req, directory, "admin-id")),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter((r) => r.status === "rejected" && status(409)(r.reason))
      .length,
    1,
  );
  await writeFile(join(directory, "blocked.png"), "existing file");
  await assert.rejects(
    uploadDesignFile(await request("blocked.png"), directory, "admin-id"),
  );
  assert.equal(
    (await readdir(directory)).some((name) => name.startsWith(".upload-")),
    false,
  );
  assert.equal((await listDesignFiles(directory)).length, 2);
});

test("design uploads enforce formats, filenames, descriptions and byte limits", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mathrix-designs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [filename, bytes, type] of [
    [
      "sample.JPG",
      Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex"),
      "image/jpeg",
    ],
    ["sample.gif", Buffer.from("GIF89a"), "image/gif"],
    ["sample.webp", Buffer.from("RIFF0000WEBP"), "image/webp"],
    ["sample.pdf", Buffer.from("%PDF-1.4\n%%EOF\n"), "application/pdf"],
  ] as const) {
    await uploadDesignFile(
      await request(filename, bytes, type),
      directory,
      "admin-id",
    );
    assert.deepEqual(
      (await downloadDesignFile(directory, filename)).bytes,
      bytes,
    );
  }
  for (const [req, expected] of [
    [await request("bad.svg", Buffer.from("<svg/>"), "image/svg+xml"), 415],
    [await request("bad.png", Buffer.from("<html>not an image</html>")), 415],
    [await request("bad.pdf", png, "application/pdf"), 415],
    [await request("bad.png", png, "application/pdf"), 415],
    [await request(".hidden.png"), 400],
    [await request("x".repeat(201) + ".png"), 400],
    [await request("empty.png", Buffer.alloc(0)), 400],
    [await request("missing-description.png", png, "image/png", "  "), 400],
    [
      await request("long-description.png", png, "image/png", "x".repeat(2001)),
      400,
    ],
    [await request("oversize.png", Buffer.alloc(10 * 1024 * 1024 + 1)), 413],
  ] as const)
    await assert.rejects(
      uploadDesignFile(req, directory, "admin-id"),
      status(expected),
    );
  const chunked = Object.assign(
    Readable.from([
      Buffer.alloc(6 * 1024 * 1024),
      Buffer.alloc(5 * 1024 * 1024),
    ]),
    { headers: { "content-type": "multipart/form-data; boundary=test" } },
  ) as unknown as IncomingMessage;
  await assert.rejects(
    uploadDesignFile(chunked, directory, "admin-id"),
    status(413),
  );
  assert.equal(
    chunked.destroyed,
    false,
    "oversized requests must still receive an HTTP error",
  );
  chunked.destroy();
  for (const name of [
    "../secret.png",
    "/secret.png",
    "bad\\name.png",
    "bad\nname.png",
    "",
  ]) {
    await assert.rejects(downloadDesignFile(directory, name), status(400));
  }
  await assert.rejects(
    downloadDesignFile(directory, "missing.png"),
    status(404),
  );
  assert.equal((await listDesignFiles(directory)).length, 4);
  assert.equal((await readdir(directory)).length, 4);
});
