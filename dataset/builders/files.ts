import type { MultipartFile } from "@api/http/http-client";

import { uniqueId } from "@core/unique-id";

/**
 * Builds a `text/plain` file for uploading.
 *
 * @param name - Such as `test-asset.txt`; not made unique.
 */
export function textFile(name: string, text: string): MultipartFile {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

/**
 * Builds a markdown file `<prefix>-<unique>.md` for uploading as content; it holds one heading with its name.
 *
 * @param prefix - Such as `test-page`.
 */
export function markdownFile(prefix: string): MultipartFile {
  const name = `${uniqueId(prefix)}.md`;
  return { name, mimeType: "text/markdown", buffer: Buffer.from(`# ${name}\n`) };
}

/** Builds a Windows executable `test-executable-<unique>.exe`, for uploads the platform must reject. */
export function executableFile(): MultipartFile {
  return {
    name: `${uniqueId("test-executable")}.exe`,
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ"),
  };
}
