import type { IncomingMessage } from "node:http";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";

export type DesignFile = {
  filename: string;
  description: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
};
export class DesignFileError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const maxFileSize = 10 * 1024 * 1024;
const maxRequestSize = maxFileSize + 64 * 1024;
const mimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};
function validateFilename(filename: string) {
  if (
    !filename ||
    filename !== filename.trim() ||
    filename.startsWith(".") ||
    /[\p{Cc}/\\]/u.test(filename) ||
    Buffer.byteLength(filename) > 200
  )
    throw new DesignFileError(
      "Use a filename without paths or control characters (maximum 200 bytes).",
    );
  return filename;
}
function signature(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")))
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("latin1", 0, 6)))
    return "image/gif";
  if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (bytes.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return "";
}
export async function listDesignFiles(
  directory: string,
): Promise<DesignFile[]> {
  // ponytail: scan a small admin library; add an index if listing becomes slow.
  const files = await Promise.all(
    (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(
        async (entry) =>
          JSON.parse(
            await readFile(
              join(directory, entry.name, "metadata.json"),
              "utf8",
            ),
          ) as DesignFile,
      ),
  );
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function uploadDesignFile(
  req: IncomingMessage,
  directory: string,
  uploadedBy: string,
): Promise<DesignFile> {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new DesignFileError("Choose a file and upload it as form data.", 415);
  if (Number(req.headers["content-length"]) > maxRequestSize)
    throw new DesignFileError("Files must be 10 MiB or smaller.", 413);
  // ponytail: buffer uploads capped at 10 MiB; stream to disk if larger files are needed.
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > maxRequestSize)
      throw new DesignFileError("Files must be 10 MiB or smaller.", 413);
    chunks.push(chunk);
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new DesignFileError("Invalid upload. Choose the file and try again.");
  }
  const file = form.get("file"),
    description = form.get("description");
  if (
    !(file instanceof File) ||
    form.getAll("file").length !== 1 ||
    form.getAll("description").length !== 1 ||
    [...form.keys()].some((key) => key !== "file" && key !== "description")
  )
    throw new DesignFileError("Upload exactly one file and one description.");
  const filename = validateFilename(file.name);
  if (
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 2000
  )
    throw new DesignFileError("Enter a description of 1–2,000 characters.");
  if (!file.size) throw new DesignFileError("The file is empty.");
  if (file.size > maxFileSize)
    throw new DesignFileError("Files must be 10 MiB or smaller.", 413);
  const bytes = Buffer.from(await file.arrayBuffer()),
    mimeType = mimeTypes[extname(filename).toLowerCase()];
  if (
    !mimeType ||
    signature(bytes) !== mimeType ||
    (file.type &&
      file.type !== "application/octet-stream" &&
      file.type !== mimeType)
  )
    throw new DesignFileError(
      "Upload a PNG, JPEG, WebP, GIF, or PDF with a matching file extension and type.",
      415,
    );
  const metadata: DesignFile = {
    filename,
    description: description.trim(),
    mimeType,
    size: bytes.length,
    uploadedBy,
    createdAt: new Date().toISOString(),
  };
  const temporary = await mkdtemp(join(directory, ".upload-"));
  try {
    await writeFile(join(temporary, filename), bytes, {
      mode: 0o600,
      flag: "wx",
    });
    await writeFile(
      join(temporary, "metadata.json"),
      JSON.stringify(metadata, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    // A completed directory is nonempty, so rename cannot replace an existing upload.
    await rename(temporary, join(directory, filename));
  } catch (error) {
    if (
      ["ENOTEMPTY", "EEXIST"].includes(
        (error as NodeJS.ErrnoException).code || "",
      )
    )
      throw new DesignFileError(
        "That filename already exists. Rename your file before uploading.",
        409,
      );
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return metadata;
}
export async function downloadDesignFile(directory: string, filename: string) {
  validateFilename(filename);
  try {
    const metadata: DesignFile = JSON.parse(
      await readFile(join(directory, filename, "metadata.json"), "utf8"),
    );
    const bytes = await readFile(join(directory, filename, filename));
    return { metadata, bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new DesignFileError("Design file not found.", 404);
    throw error;
  }
}
