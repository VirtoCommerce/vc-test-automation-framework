import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXAMPLES = "docs/examples";
const MARKDOWN_FILES = ["README.md", ".changeset/README.md", ...filesIn("docs").filter(isMarkdown)];
const EXPORT = /^export (?:async )?(?:function|class|interface|type|const|let|enum|abstract class) (\w+)/;
const EXAMPLE = /<!-- example: (\S+) -->\n```ts\n([\s\S]*?)```\n/g;
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FENCE = /```[\s\S]*?```/g;

const write = process.argv.includes("--write");
const problems: string[] = [];
const embedded = new Set<string>();

for (const file of MARKDOWN_FILES) {
  checkFile(file);
}

for (const example of readdirSync(join(ROOT, EXAMPLES))) {
  if (example.endsWith(".ts") && !embedded.has(join(ROOT, EXAMPLES, example))) {
    problems.push(`${EXAMPLES}/${example}: no page embeds this example`);
  }
}

for (const source of filesIn("src").filter((path: string) => path.endsWith(".ts") && !path.endsWith("index.ts"))) {
  checkDocComments(source);
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${MARKDOWN_FILES.length} Markdown files and the documentation comments of src.\n`);
}

function checkFile(file: string): void {
  const path = join(ROOT, file);
  const text = readFileSync(path, "utf8");
  const synced = syncExamples(file, text);
  if (synced !== text) {
    if (write) {
      writeFileSync(path, synced);
    } else {
      problems.push(`${file}: an embedded example differs from its file; run npm run docs:sync`);
    }
  }
  for (const match of synced.replace(FENCE, "").matchAll(LINK)) {
    checkLink(file, match[1] ?? "");
  }
}

function syncExamples(file: string, text: string): string {
  return text.replace(EXAMPLE, (block: string, example: string) => {
    const examplePath = join(ROOT, dirname(file), example);
    if (!existsSync(examplePath)) {
      problems.push(`${file}: the example ${example} does not exist`);
      return block;
    }
    embedded.add(examplePath);
    return `<!-- example: ${example} -->\n\`\`\`ts\n${readFileSync(examplePath, "utf8")}\`\`\`\n`;
  });
}

function checkLink(file: string, target: string): void {
  if (/^[a-z]+:/i.test(target)) {
    return;
  }
  const [pathPart = "", anchor] = target.split("#");
  const targetFile = pathPart === "" ? join(ROOT, file) : resolve(ROOT, dirname(file), pathPart);
  if (!existsSync(targetFile)) {
    problems.push(`${file}: the link ${target} points to a missing file`);
    return;
  }
  if (anchor !== undefined && targetFile.endsWith(".md") && !headingSlugs(targetFile).has(anchor)) {
    problems.push(`${file}: the link ${target} points to a missing heading in ${relative(ROOT, targetFile)}`);
  }
}

function headingSlugs(path: string): Set<string> {
  const slugs = new Set<string>();
  const counts = new Map<string, number>();
  for (const line of readFileSync(path, "utf8").replace(FENCE, "").split("\n")) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined) {
      continue;
    }
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0;
    slugs.add(count === 0 ? slug : `${slug}-${count}`);
    counts.set(slug, count + 1);
  }
  return slugs;
}

function checkDocComments(file: string): void {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    const name = EXPORT.exec(line)?.[1];
    if (name !== undefined && !(lines[index - 1] ?? "").trimEnd().endsWith("*/")) {
      problems.push(`${file}:${index + 1}: the export ${name} has no documentation comment`);
    }
  }
}

function isMarkdown(path: string): boolean {
  return path.endsWith(".md");
}

function filesIn(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name: string) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? filesIn(path) : [path];
  });
}
