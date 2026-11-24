import type { MultipartFile } from "@virtocommerce/test-automation-framework/http";

import { uniqueId } from "../support/unique-id.ts";

/**
 * Returns a plain text file to upload.
 *
 * @param name - The file name.
 * @param text - The content of the file.
 * @returns The file.
 */
export function textFile(name: string, text: string): MultipartFile {
  return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}

/**
 * Returns a Markdown file with a unique name and its name as a heading.
 *
 * @param prefix - The start of the file name.
 * @returns The file.
 */
export function markdownFile(prefix: string): MultipartFile {
  const name = `${uniqueId(prefix)}.md`;
  return { name, mimeType: "text/markdown", buffer: Buffer.from(`# ${name}\n`) };
}

/**
 * Returns a Windows executable file with a unique name, for checks of forbidden file extensions.
 *
 * @returns The file.
 */
export function executableFile(): MultipartFile {
  return { name: `${uniqueId("test-file")}.exe`, mimeType: "application/octet-stream", buffer: Buffer.from("MZ") };
}
