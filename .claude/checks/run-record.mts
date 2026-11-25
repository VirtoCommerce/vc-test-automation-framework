import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** What `reconcile-run` reads from the disk to decide whether a report is stale; replaceable for a test. */
export type SourceIo = {
  read: (path: string) => string | undefined;
  modified: (path: string) => number | undefined;
};

type Series = { projects: string[]; flags: Map<string, string>; specs: string[] };

const SERIES_FLAGS = ["workers", "repeat-each", "retries", "grep"] as const;
const SPEC_TOKEN = /\.(?:spec|test)\.[cm]?[jt]sx?(?::\d+)?$/;
const COMMENT = /<!--[\s\S]*?-->/g;
const EXTENSIONS = ["", ".ts", ".mts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"];
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
const MAX_FILES = 2000;
const MAX_SHOWN = 8;
const DEVIATION = /^\s*deviation:\s*(\S.*)$/i;
const PROJECT_FLAG = "project";
const VALUE_FLAGS = [PROJECT_FLAG, ...SERIES_FLAGS] as const;
const SHORT_FLAGS: Readonly<Record<string, string>> = { g: "grep", j: "workers" };
const SHELL_WORD = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
const QUOTED = /"([^"]*)"|'([^']*)'/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedSpec(token: string): string {
  return token
    .replaceAll("\\", "/")
    .replace(/:\d+$/, "")
    .replace(/^\.\//, "")
    .replace(/^["']|["']$/g, "");
}

/** True when two spec paths name the same file: equal, or one ends with the other after a `/`. */
export function sameSpec(left: string, right: string): boolean {
  const [a, b] = [normalizedSpec(left), normalizedSpec(right)];
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/** A flag of the Playwright CLI that takes a value: its long name and the value when it is in the same token. */
function valueFlagOf(token: string): { name: string; value: string | undefined } | undefined {
  const long = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(token);
  const short = /^-([a-z])([\s\S]*)$/.exec(token);
  const name = long?.[1] ?? SHORT_FLAGS[short?.[1] ?? ""];
  if (name === undefined || !VALUE_FLAGS.some((flag) => flag === name)) {
    return undefined;
  }
  const attached = long === null ? short?.[2] : long[2];
  return { name, value: attached === "" ? undefined : attached };
}

/**
 * The project, series flags and spec files of one test command, as the Playwright CLI reads them: `--name=value`,
 * `--name value`, and the short `-g`, `-j` with the value attached or as the next word.
 */
function parseSeries(tokens: readonly string[]): Series {
  const series: Series = { projects: [], flags: new Map(), specs: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const flag = valueFlagOf(token);
    if (flag !== undefined) {
      const value = flag.value ?? tokens[index + 1];
      index += flag.value === undefined ? 1 : 0;
      if (value === undefined) {
        continue;
      }
      if (flag.name === PROJECT_FLAG) {
        series.projects.push(value);
      } else {
        series.flags.set(flag.name, value);
      }
    } else if (SPEC_TOKEN.test(token)) {
      series.specs.push(normalizedSpec(token));
    }
  }
  return series;
}

/** The words of a command written in the contract, as a shell splits them: quotes group words and are removed. */
function shellWords(text: string): string[] {
  return (text.match(SHELL_WORD) ?? []).map((word) =>
    word.replace(QUOTED, (_: string, double: string | undefined, single: string | undefined) => double ?? single ?? ""),
  );
}

/** The text of `## Verification` of a contract, without comments. */
function verificationOf(markdown: string): string[] {
  const lines = markdown.replace(COMMENT, "").split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Verification\s*$/.test(line));
  if (start < 0) {
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## \S/.test(line));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The test commands the contract's Verification writes: a command with a series flag, a project or a spec file. */
export function contractSeries(markdown: string): Series[] {
  const series: Series[] = [];
  for (const line of verificationOf(markdown)) {
    const text = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
    const segments = text.includes("`") ? text.split("`").filter((_, index) => index % 2 === 1) : [text];
    for (const segment of segments) {
      const parsed = parseSeries(shellWords(segment));
      if (parsed.projects.length > 0 || parsed.flags.size > 0 || parsed.specs.length > 0) {
        series.push(parsed);
      }
    }
  }
  return series;
}

function reportProjects(report: unknown, argvProjects: readonly string[]): string[] {
  if (argvProjects.length > 0) {
    return [...argvProjects];
  }
  const names = new Set<string>();
  const walk = (suite: unknown): void => {
    if (!isRecord(suite)) {
      return;
    }
    for (const spec of Array.isArray(suite["specs"]) ? suite["specs"] : []) {
      for (const entry of isRecord(spec) && Array.isArray(spec["tests"]) ? spec["tests"] : []) {
        if (isRecord(entry) && typeof entry["projectName"] === "string") {
          names.add(entry["projectName"]);
        }
      }
    }
    for (const child of Array.isArray(suite["suites"]) ? suite["suites"] : []) {
      walk(child);
    }
  };
  for (const suite of isRecord(report) && Array.isArray(report["suites"]) ? report["suites"] : []) {
    walk(suite);
  }
  return [...names];
}

function flagDifferences(contract: readonly Series[], actual: Series): string[] {
  const found: string[] = [];
  for (const flag of SERIES_FLAGS) {
    const wanted = [...new Set(contract.flatMap((series) => series.flags.get(flag) ?? []))];
    const real = actual.flags.get(flag);
    if (wanted.length > 0 && (real === undefined || !wanted.includes(real))) {
      found.push(
        `--${flag}=${wanted.join(" or ")} in the contract's Verification, ${real === undefined ? "not given" : `--${flag}=${real}`} in the series`,
      );
    }
  }
  return found;
}

function listDifferences(
  what: string,
  wanted: readonly string[],
  real: readonly string[],
  same: (a: string, b: string) => boolean,
): string[] {
  if (wanted.length === 0) {
    return [];
  }
  return [
    ...wanted
      .filter((item) => !real.some((other) => same(item, other)))
      .map((item) => `${what} ${item} is named in the contract's Verification, not in the series`),
    ...real
      .filter((item) => !wanted.some((other) => same(item, other)))
      .map((item) => `${what} ${item} ran in the series, the contract's Verification does not name it`),
  ];
}

/**
 * Every difference between the series the report records (`config.argv`, the command Playwright was started with)
 * and the test commands the contract's `## Verification` writes: a flag among `--workers`, `--repeat-each`,
 * `--retries` and `--grep` that the contract gives and the series did not, a project or spec file on one side only.
 * Only commands that name a project the series ran (or none) are compared, and only what the contract states.
 *
 * @returns one line per difference; a report with no `config.argv` is itself one line, because nothing can be compared.
 */
export function argvDifferences(report: unknown, contractMarkdown: string): string[] {
  const config = isRecord(report) ? report["config"] : undefined;
  const argv = isRecord(config) && Array.isArray(config["argv"]) ? config["argv"].map(String) : undefined;
  if (argv === undefined) {
    return ["the report holds no config.argv, so the series' real command cannot be compared with the contract"];
  }
  const actual = parseSeries(argv.slice(argv.indexOf("test") + 1));
  const ran = reportProjects(report, actual.projects);
  const contract = contractSeries(contractMarkdown).filter(
    (series) => series.projects.length === 0 || series.projects.some((project) => ran.includes(project)),
  );
  if (contract.length === 0) {
    return [];
  }
  return [
    ...flagDifferences(contract, actual),
    ...listDifferences(
      "project",
      [...new Set(contract.flatMap((series) => series.projects))],
      actual.projects,
      (left, right) => left === right,
    ),
    ...listDifferences("spec", [...new Set(contract.flatMap((series) => series.specs))], actual.specs, sameSpec),
  ];
}

/** The `deviation: <reason>` lines of the run record's deviation file: why the series differed from the contract. */
export function deviationLines(text: string | undefined): string[] {
  return (text ?? "").split(/\r?\n/).flatMap((line) => DEVIATION.exec(line)?.[1]?.trim() ?? []);
}

/** The JSON text without line and block comments (a tsconfig.json has them), keeping strings as they are. */
function stripJsonComments(text: string): string {
  return text.replace(
    /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_, string: string | undefined) => string ?? "",
  );
}

function aliasesOf(rootDir: string, io: SourceIo): { prefix: string; target: string }[] {
  const text = io.read(join(rootDir, "tsconfig.json"));
  if (text === undefined) {
    return [];
  }
  try {
    const options: unknown = (JSON.parse(stripJsonComments(text)) as Record<string, unknown>)["compilerOptions"];
    const paths = isRecord(options) && isRecord(options["paths"]) ? options["paths"] : {};
    const base =
      isRecord(options) && typeof options["baseUrl"] === "string" ? join(rootDir, options["baseUrl"]) : rootDir;
    return Object.entries(paths).flatMap(([pattern, targets]) => {
      const target = Array.isArray(targets) ? targets[0] : undefined;
      return typeof target === "string"
        ? [{ prefix: pattern.replace(/\*$/, ""), target: join(base, target.replace(/\*$/, "")) }]
        : [];
    });
  } catch {
    return [];
  }
}

function resolveImport(
  from: string,
  specifier: string,
  aliases: readonly { prefix: string; target: string }[],
  io: SourceIo,
): string | undefined {
  let base: string | undefined;
  if (specifier.startsWith(".")) {
    base = resolve(dirname(from), specifier);
  } else {
    const alias = aliases.find(
      ({ prefix }) => specifier === prefix || (prefix.endsWith("/") && specifier.startsWith(prefix)),
    );
    base = alias === undefined ? undefined : alias.target + specifier.slice(alias.prefix.length);
  }
  return base === undefined
    ? undefined
    : EXTENSIONS.map((extension) => `${base}${extension}`).find(
        (path) => io.modified(path) !== undefined && io.read(path) !== undefined,
      );
}

/**
 * The files a report covers: its spec files (`suites[].file`, relative to `config.rootDir`) and the files they import,
 * relative or through the `paths` of the suite's `tsconfig.json`, followed to any depth. Packages are not followed.
 */
export function coveredFiles(report: unknown, io: SourceIo): string[] {
  const config = isRecord(report) ? report["config"] : undefined;
  const rootDir = isRecord(config) && typeof config["rootDir"] === "string" ? config["rootDir"] : undefined;
  if (rootDir === undefined) {
    return [];
  }
  const aliases = aliasesOf(rootDir, io);
  const queue = (isRecord(report) && Array.isArray(report["suites"]) ? report["suites"] : []).flatMap((suite) =>
    isRecord(suite) && typeof suite["file"] === "string" ? [resolve(rootDir, suite["file"])] : [],
  );
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < MAX_FILES) {
    const file = queue.shift() ?? "";
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const match of (io.read(file) ?? "").matchAll(IMPORT)) {
      const found = resolveImport(file, match[1] ?? "", aliases, io);
      if (found !== undefined && !seen.has(found)) {
        queue.push(found);
      }
    }
  }
  return [...seen];
}

/**
 * The covered files edited after the run started (`stats.startTime`): the report describes code that has since
 * changed, so it proves nothing about the code now.
 *
 * @returns up to eight lines, one per file, and a count line for the rest; empty when the report is current or has no
 * start time.
 */
export function staleSources(report: unknown, io: SourceIo): string[] {
  const stats = isRecord(report) ? report["stats"] : undefined;
  const started =
    isRecord(stats) && typeof stats["startTime"] === "string" ? Date.parse(stats["startTime"]) : Number.NaN;
  if (Number.isNaN(started)) {
    return [];
  }
  const config = isRecord(report) ? report["config"] : undefined;
  const root = isRecord(config) && typeof config["rootDir"] === "string" ? config["rootDir"] : "";
  const newer = coveredFiles(report, io).filter((file) => (io.modified(file) ?? 0) > started);
  const names = newer.map((file) => file.replaceAll("\\", "/").replace(`${root.replaceAll("\\", "/")}/`, ""));
  const lines = names.slice(0, MAX_SHOWN).map((name) => `${name} was edited after the run started`);
  return names.length > MAX_SHOWN
    ? [...lines, `and ${names.length - MAX_SHOWN} more files were edited after the run started`]
    : lines;
}

/** The real filesystem for {@link staleSources}. */
export const DISK: SourceIo = {
  read(path) {
    try {
      return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
    } catch {
      return undefined;
    }
  },
  modified(path) {
    try {
      return statSync(path).isFile() ? statSync(path).mtimeMs : undefined;
    } catch {
      return undefined;
    }
  },
};
