import type { ContractReferences } from "./contract.mts";

import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { contractReferences, namesCase } from "./contract.mts";
import { ROOT_SUITE_DIR, readProjectFacts } from "./project-facts.mts";
import { EXPLORER_WRITE_DIR, HEALER_RUN_DIR, JUDGE_WRITE_DIR, PROBE_DIR, PROBE_FILE } from "./readonly-shell.mts";
import { contractSeries, sameSpec } from "./run-record.mts";

const CLI_FILE_NAME = "prune.mts";
const QA_DIR = ".qa";
const CONTRACTS_DIR = `${QA_DIR}/contracts`;
const FETCH_FLAG = "--fetch";
const YES_FLAG = "--yes";
const STALE_FLAG = "--include-stale";
const DAYS_PREFIX = "--days=";
const FLAGS = [FETCH_FLAG, YES_FLAG, STALE_FLAG];
const DEFAULT_DAYS = 30;
const KEPT_COVERAGE_REPORTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const REMOTE = "origin";
const FALLBACK_BRANCHES = ["main", "dev"];
const GIT_BUFFER = 256 * 1024 * 1024;
const GIT_TIMEOUT_MS = 120_000;
const CONTRACT_FILE = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\.md$/;
const SPEC_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const TEST_TITLE = /\btest(?:\.(?:only|skip|fixme|fail|slow))?\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
const EXPLORE_REPORT = /^explore-([a-z0-9]+(?:-[a-z0-9]+)*?)(-observed)?\.md$/;
const OBSERVED_REPORT = /-observed\.md$/;
const COVERAGE_REPORT = /^coverage-(\d{4}-\d{2}-\d{2})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?\.md$/;
const GAPS_SUFFIX = /-gaps\.md$/;
const HEAL_REPORT = /^heal-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const HEAL_RUN = /^heal-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_ENV = /\.local\.env$/;
const BRANCH_BOUNDARY = "[^a-z0-9]";
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const USAGE = `prune: usage is node .claude/checks/${CLI_FILE_NAME} [${FETCH_FLAG}] [${YES_FLAG} [${STALE_FLAG}]] [${DAYS_PREFIX}<n>, ${DEFAULT_DAYS} by default], run from the repository root`;

/** A path under `.qa/` to remove, relative to the repository root with `/`, and why, in one line. */
export type Removal = { path: string; reason: string };

/**
 * What a prune would do: `automatic` is removed with `--yes`, `ask` only with `--yes --include-stale`, `held` names
 * the done contracts that are kept and why, and `notes` say what could not be decided (`not reached: <why>`).
 */
export type PrunePlan = { notes: string[]; automatic: Removal[]; held: Removal[]; ask: Removal[] };

/** Runs git in the repository with the given arguments and standard input; undefined when it fails. */
export type Git = (args: readonly string[], input?: string) => Buffer | undefined;

/** What the plan is made with: the suite directory, the age limit of the ask class, the time now, and whether to fetch. */
export type PruneOptions = { suiteDir: string; days: number; now: number; fetch: boolean };

type Contract = { name: string; path: string; markdown: string; references: ContractReferences; modified: number };

type Branches = { ref: string; unmerged: string[] };

function gitText(git: Git, args: readonly string[]): string | undefined {
  return git(args)?.toString("utf8");
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function entriesOf(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** The newest change time under `path`, the path itself included; links are not followed. */
function newestChange(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }
  return Math.max(stat.mtimeMs, ...entriesOf(path).map((entry) => newestChange(join(path, entry))));
}

function ageInDays(root: string, path: string, now: number): number {
  return Math.floor((now - newestChange(join(root, path))) / DAY_MS);
}

/** The default branch of `origin` as a remote ref (`origin/HEAD`, else `origin/main`, else `origin/dev`), or why not. */
function defaultBranch(git: Git): string | { notReached: string } {
  const head = gitText(git, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${REMOTE}/HEAD`])?.trim();
  const candidates = [
    ...(head === undefined || head === "" ? [] : [head]),
    ...FALLBACK_BRANCHES.map((name) => `${REMOTE}/${name}`),
  ];
  const ref = candidates.find(
    (candidate) =>
      gitText(git, ["rev-parse", "--verify", "--quiet", `refs/remotes/${candidate}^{commit}`]) !== undefined,
  );
  return (
    ref ?? {
      notReached: `no ${REMOTE}/HEAD, ${FALLBACK_BRANCHES.map((name) => `${REMOTE}/${name}`).join(" or ")} ref (run with ${FETCH_FLAG})`,
    }
  );
}

/** The local branches not merged into `ref`. */
function unmergedBranches(git: Git, ref: string): string[] | undefined {
  const all = gitText(git, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  const merged = gitText(git, ["for-each-ref", "--format=%(refname:short)", `--merged=${ref}`, "refs/heads"]);
  if (all === undefined || merged === undefined) {
    return undefined;
  }
  const mergedNames = merged.split("\n").map((name) => name.trim());
  return all
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "" && !mergedNames.includes(name));
}

function parseBatch(output: Buffer, files: readonly string[]): Map<string, string> {
  const contents = new Map<string, string>();
  let offset = 0;
  for (const file of files) {
    const end = output.indexOf("\n", offset);
    if (end < 0) {
      break;
    }
    const header = output.subarray(offset, end).toString("utf8").split(" ");
    offset = end + 1;
    if (header[1] !== "blob") {
      continue;
    }
    const size = Number(header[2]);
    contents.set(file, output.subarray(offset, offset + size).toString("utf8"));
    offset += size + 1;
  }
  return contents;
}

/**
 * The test titles of every spec file of the suite directory at `ref`, by repository path, read from git objects: no
 * checkout, no Playwright. A title is the first argument of `test(…)` (or `test.only`, `skip`, `fixme`, `fail`, `slow`)
 * when it is a string literal.
 */
function titlesAt(git: Git, ref: string, suiteDir: string): Map<string, string[]> | undefined {
  const listing = gitText(git, ["ls-tree", "-r", "-z", "--full-name", "--name-only", ref, "--", suiteDir]);
  if (listing === undefined) {
    return undefined;
  }
  const files = listing.split("\0").filter((file) => SPEC_FILE.test(file) && !file.includes("\n"));
  if (files.length === 0) {
    return new Map();
  }
  const output = git(["cat-file", "--batch"], files.map((file) => `${ref}:${file}\n`).join(""));
  if (output === undefined) {
    return undefined;
  }
  const titles = new Map<string, string[]>();
  for (const [file, source] of parseBatch(output, files)) {
    titles.set(
      file,
      [...source.matchAll(TEST_TITLE)].map((match) => match[2] ?? ""),
    );
  }
  return titles;
}

function readContracts(root: string): Contract[] {
  return entriesOf(join(root, CONTRACTS_DIR)).flatMap((entry) => {
    const name = CONTRACT_FILE.exec(entry)?.[1];
    const path = `${CONTRACTS_DIR}/${entry}`;
    if (name === undefined || !isFile(join(root, path))) {
      return [];
    }
    const markdown = readFileSync(join(root, path), "utf8");
    return [
      { name, path, markdown, references: contractReferences(markdown), modified: newestChange(join(root, path)) },
    ];
  });
}

/**
 * The spec files at the default branch that hold a test of the contract, when every live case has one; else none. Only
 * the spec files its `## Verification` runs count: case ids (`C-01`) repeat from one contract to the next, so a title
 * of another contract's spec never makes this one done, and a contract whose Verification names no spec file is never
 * done.
 */
function doneSpecs(contract: Contract, titles: Map<string, string[]>, suiteDir: string): string[] | undefined {
  const { caseIds, dropped } = contract.references;
  const live = caseIds.filter((caseId) => !dropped.includes(caseId));
  const own = verificationSpecs(contract, suiteDir);
  const specs = [...titles].filter(
    ([file, names]) =>
      own.some((spec) => sameSpec(spec, file)) &&
      names.some((title) => live.some((caseId) => namesCase(title, caseId))),
  );
  const covered = live.every((caseId) => specs.some(([, names]) => names.some((title) => namesCase(title, caseId))));
  return live.length > 0 && covered ? specs.map(([file]) => file) : undefined;
}

function verificationSpecs(contract: Contract, suiteDir: string): string[] {
  return contractSeries(contract.markdown)
    .flatMap((series) => series.specs)
    .map((spec) => (suiteDir === ROOT_SUITE_DIR || spec.startsWith(`${suiteDir}/`) ? spec : `${suiteDir}/${spec}`));
}

function namesBranch(branch: string, name: string): boolean {
  const pattern = `(^|${BRANCH_BOUNDARY})${name.toLowerCase().replace(REGEX_SPECIALS, "\\$&")}(${BRANCH_BOUNDARY}|$)`;
  return new RegExp(pattern).test(branch.toLowerCase());
}

/** Why a done contract is kept: its spec files changed and not pushed, or an unmerged local branch carries its name. */
function holdReason(git: Git, contract: Contract, files: readonly string[], branches: Branches): string | undefined {
  const status = gitText(git, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...files]);
  if (status === undefined) {
    return "git status of its spec files failed";
  }
  const changed = status.split("\0").find((entry) => entry.length > 3);
  if (changed !== undefined) {
    return `uncommitted changes in ${changed.slice(3)}`;
  }
  const upstream = gitText(git, ["rev-parse", "--verify", "--quiet", "@{upstream}"]);
  const base = upstream === undefined ? branches.ref : "@{upstream}";
  const unpushed = gitText(git, ["log", "--format=%h", `${base}..HEAD`, "--", ...files]);
  if (unpushed === undefined) {
    return "git log of its spec files failed";
  }
  if (unpushed.trim() !== "") {
    return `unpushed commits change its spec files (${unpushed.trim().split("\n").length})`;
  }
  const branch = branches.unmerged.find((name) => namesBranch(name, contract.name));
  return branch === undefined ? undefined : `local branch ${branch} is not merged into ${branches.ref}`;
}

function existing(root: string, paths: readonly string[]): string[] {
  return paths.filter((path) => exists(join(root, path)));
}

function contractFiles(root: string, contract: Contract): string[] {
  return existing(root, [contract.path, `${HEALER_RUN_DIR}/${contract.name}`, `${JUDGE_WRITE_DIR}/${contract.name}`]);
}

function reasonOf(path: string, contract: Contract, done: string): string {
  if (path === contract.path) {
    return done;
  }
  return path.startsWith(HEALER_RUN_DIR) ? `run record of ${contract.path}` : `judge verdict of ${contract.path}`;
}

/** The reports the contracts that stay cite, in their oracles or their `## Source`: never removed. */
function citedBy(contracts: readonly Contract[], done: ReadonlySet<string>): Set<string> {
  return new Set(
    contracts
      .filter((contract) => !done.has(contract.path))
      .flatMap((contract) => [...contract.references.observedReports, ...contract.references.sourceFiles]),
  );
}

type AutomaticResult = { notes: string[]; automatic: Removal[]; held: Removal[]; done: Set<string> };

function automaticClass(root: string, git: Git, contracts: Contract[], options: PruneOptions): AutomaticResult {
  const notes: string[] = [];
  const hasRemote = gitText(git, ["remote", "get-url", REMOTE]) !== undefined;
  if (hasRemote && options.fetch && git(["fetch", "--quiet", "--no-tags", REMOTE]) === undefined) {
    notes.push(`git fetch ${REMOTE} failed: the existing remote refs are read`);
  }
  const ref = hasRemote ? defaultBranch(git) : { notReached: `no remote ${REMOTE}` };
  if (typeof ref !== "string") {
    return { notes: [...notes, `not reached: ${ref.notReached}`], automatic: [], held: [], done: new Set() };
  }
  const titles = titlesAt(git, ref, options.suiteDir);
  const unmerged = unmergedBranches(git, ref);
  if (titles === undefined || unmerged === undefined) {
    return {
      notes: [...notes, `not reached: the spec files or branches at ${ref} could not be read`],
      automatic: [],
      held: [],
      done: new Set(),
    };
  }
  const automatic: Removal[] = [];
  const held: Removal[] = [];
  const done = new Set<string>();
  for (const contract of contracts) {
    const specs = doneSpecs(contract, titles, options.suiteDir);
    if (specs === undefined) {
      continue;
    }
    const files = [...new Set([...specs, ...verificationSpecs(contract, options.suiteDir)])];
    const hold = holdReason(git, contract, files, { ref, unmerged });
    const where = `every case is in a test title of its Verification's spec files on ${ref}`;
    if (hold !== undefined) {
      held.push({ path: contract.path, reason: `${where}, but ${hold}` });
      continue;
    }
    done.add(contract.path);
    automatic.push(...contractFiles(root, contract).map((path) => ({ path, reason: reasonOf(path, contract, where) })));
  }
  const cited = citedBy(contracts, done);
  for (const contract of contracts.filter((item) => done.has(item.path))) {
    const reports = contract.references.observedReports.filter(
      (path) => OBSERVED_REPORT.test(path) && !cited.has(path) && !automatic.some((removal) => removal.path === path),
    );
    automatic.push(...existing(root, reports).map((path) => ({ path, reason: `observed values of ${contract.path}` })));
  }
  return { notes, automatic, held, done };
}

function reportsIn(root: string): string[] {
  return entriesOf(join(root, EXPLORER_WRITE_DIR)).filter((entry) => isFile(join(root, EXPLORER_WRITE_DIR, entry)));
}

function staleContracts(root: string, contracts: Contract[], skipped: Set<string>, options: PruneOptions): Removal[] {
  return contracts
    .filter((contract) => !skipped.has(contract.path) && !contract.references.approved)
    .filter((contract) => options.now - contract.modified > options.days * DAY_MS)
    .flatMap((contract) => {
      const why = `no ## Approval, unchanged for ${ageInDays(root, contract.path, options.now)} days`;
      return contractFiles(root, contract).map((path) => ({ path, reason: reasonOf(path, contract, why) }));
    });
}

function oldCoverageReports(reports: readonly string[]): Removal[] {
  const bySlug = new Map<string, { date: string; file: string }[]>();
  for (const file of reports) {
    const match = COVERAGE_REPORT.exec(file.replace(GAPS_SUFFIX, ".md"));
    if (match?.[1] !== undefined) {
      const slug = match[2] ?? "";
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), { date: match[1], file }]);
    }
  }
  return [...bySlug].flatMap(([slug, files]) => {
    const kept = [...new Set(files.map(({ date }) => date))].sort().reverse().slice(0, KEPT_COVERAGE_REPORTS);
    return files
      .filter(({ date }) => !kept.includes(date))
      .map(({ date, file }) => ({
        path: `${EXPLORER_WRITE_DIR}/${file}`,
        reason: `coverage of ${slug === "" ? "the whole stand" : slug} from ${date}; the ${KEPT_COVERAGE_REPORTS} newest are kept`,
      }));
  });
}

/**
 * The `-observed` reports older than the explorer report of their area (`explore-<slug>-observed.md` older than
 * `explore-<slug>.md`): the area was explored again after the values were recorded. The area report itself is never
 * planned here: observing writes its `-observed` report after the area report, so the newer one says nothing about it.
 */
function olderExplorerReports(root: string, reports: readonly string[]): Removal[] {
  const areaReports = new Map<string, string>();
  const observed: { file: string; area: string }[] = [];
  for (const file of reports) {
    const match = EXPLORE_REPORT.exec(file);
    if (match?.[1] !== undefined) {
      if (match[2] === undefined) {
        areaReports.set(match[1], file);
      } else {
        observed.push({ file, area: match[1] });
      }
    }
  }
  return observed.flatMap(({ file, area }) => {
    const areaReport = areaReports.get(area);
    return areaReport !== undefined &&
      newestChange(join(root, EXPLORER_WRITE_DIR, file)) < newestChange(join(root, EXPLORER_WRITE_DIR, areaReport))
      ? [
          {
            path: `${EXPLORER_WRITE_DIR}/${file}`,
            reason: `older than ${EXPLORER_WRITE_DIR}/${areaReport}, the report of the same area`,
          },
        ]
      : [];
  });
}

function oldHealerFiles(root: string, reports: readonly string[], options: PruneOptions): Removal[] {
  const runs = entriesOf(join(root, HEALER_RUN_DIR))
    .filter((entry) => HEAL_RUN.test(entry) && isDirectory(join(root, HEALER_RUN_DIR, entry)))
    .map((entry) => `${HEALER_RUN_DIR}/${entry}`);
  const files = [
    ...reports.filter((file) => HEAL_REPORT.test(file)).map((file) => `${EXPLORER_WRITE_DIR}/${file}`),
    ...runs,
  ];
  return files
    .map((path) => ({ path, days: ageInDays(root, path, options.now) }))
    .filter(({ days }) => days > options.days)
    .map(({ path, days }) => ({
      path,
      reason: `healer ${path.startsWith(HEALER_RUN_DIR) ? "runs" : "report"}, unchanged for ${days} days`,
    }));
}

function probeFiles(root: string): Removal[] {
  return entriesOf(join(root, PROBE_DIR))
    .map((entry) => `${PROBE_DIR}/${entry}`)
    .filter((path) => PROBE_FILE.test(path) && isFile(join(root, path)))
    .map((path) => ({ path, reason: "probe file" }));
}

/**
 * Plans the cleanup of the agents' local files under `.qa/`. A contract is done when every case id of its `## Cases`
 * that no approved amendment drops is in a test title of a spec file its `## Verification` runs, on the default branch
 * of `origin`; a done contract goes with its run record, its judge verdict and the `-observed` reports its oracles
 * cite, unless its spec files have uncommitted or unpushed changes or an unmerged local branch carries its name. The
 * ask class: contracts with no approval unchanged for `days`, coverage reports beyond the newest few per slug,
 * `-observed` reports older than the explorer report of their area, healer reports and runs unchanged for `days`, and
 * probe files. A report a kept contract cites is never planned.
 *
 * @param git runs git in `root`; see {@link Git}.
 * @returns the plan; nothing is removed.
 */
export function planPrune(root: string, options: PruneOptions, git: Git): PrunePlan {
  const contracts = readContracts(root);
  const { notes, automatic, held, done } = automaticClass(root, git, contracts, options);
  const planned = new Set(automatic.map((removal) => removal.path));
  const reports = reportsIn(root).filter((file) => !planned.has(`${EXPLORER_WRITE_DIR}/${file}`));
  const skipped = new Set([...done, ...held.map((removal) => removal.path)]);
  const cited = citedBy(contracts, done);
  const ask = [
    ...staleContracts(root, contracts, skipped, options),
    ...oldCoverageReports(reports),
    ...olderExplorerReports(root, reports),
    ...oldHealerFiles(root, reports, options),
    ...probeFiles(root),
  ].filter((removal) => !cited.has(removal.path) && !planned.has(removal.path));
  return { notes, automatic, held, ask };
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

/**
 * Why `path` must not be removed: outside `.qa/` (also through a link), the knowledge directory or inside it, or a
 * `.local.env` file; undefined when it may be.
 */
export function refusal(root: string, path: string, knowledgeDir: string): string | undefined {
  const qa = resolve(root, QA_DIR);
  const target = resolve(root, path);
  if (!isInside(qa, target) || path.split(/[\\/]/).includes("..")) {
    return "not under .qa/";
  }
  const knowledge = resolve(root, knowledgeDir);
  if (target === knowledge || isInside(knowledge, target)) {
    return `inside the knowledge directory ${knowledgeDir}`;
  }
  if (LOCAL_ENV.test(basename(target))) {
    return "a .local.env file";
  }
  try {
    const realQa = realpathSync(qa);
    if (
      realQa !== resolve(realpathSync(root), QA_DIR) ||
      !isInside(realQa, join(realpathSync(resolve(target, "..")), basename(target)))
    ) {
      return "reached through a link that leaves .qa/";
    }
  } catch {
    return "its directory cannot be resolved";
  }
  return undefined;
}

function formatLine(verb: string, removal: Removal): string {
  return `${verb} ${removal.path}: ${removal.reason}`;
}

/**
 * Removes the planned paths and returns one line per path: `removed`, or `not removed` with why.
 *
 * @param knowledgeDir the facts' knowledge directory, never removed.
 */
export function applyPrune(root: string, removals: readonly Removal[], knowledgeDir: string): string[] {
  return removals.map((removal) => {
    const refused = refusal(root, removal.path, knowledgeDir);
    if (refused !== undefined) {
      return `not removed ${removal.path}: ${refused}`;
    }
    try {
      rmSync(join(root, removal.path), { recursive: true, force: true });
      return formatLine("removed", removal);
    } catch (error) {
      return `not removed ${removal.path}: ${error instanceof Error && "code" in error ? String(error.code) : "failed"}`;
    }
  });
}

function runGit(root: string): Git {
  return (args, input) => {
    try {
      return execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.quotepath=off", ...args], {
        cwd: root,
        input,
        maxBuffer: GIT_BUFFER,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" },
        stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
      });
    } catch {
      return undefined;
    }
  };
}

function parseDays(flags: readonly string[]): number {
  const given = flags.filter((flag) => flag.startsWith(DAYS_PREFIX));
  if (given.length === 0) {
    return DEFAULT_DAYS;
  }
  const days = Number(given[0]?.slice(DAYS_PREFIX.length));
  if (given.length > 1 || !Number.isInteger(days) || days < 1) {
    throw new Error(USAGE);
  }
  return days;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const flags = process.argv.slice(2);
    const known = flags.every((flag) => FLAGS.includes(flag) || flag.startsWith(DAYS_PREFIX));
    if (!known || new Set(flags).size !== flags.length || (flags.includes(STALE_FLAG) && !flags.includes(YES_FLAG))) {
      throw new Error(USAGE);
    }
    const days = parseDays(flags);
    const root = process.cwd();
    let facts: ReturnType<typeof readProjectFacts>;
    try {
      facts = readProjectFacts();
    } catch (error) {
      throw new Error(`prune: not reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    const yes = flags.includes(YES_FLAG);
    const stale = yes && flags.includes(STALE_FLAG);
    const plan = planPrune(
      root,
      { suiteDir: facts.suiteDir, days, now: Date.now(), fetch: flags.includes(FETCH_FLAG) },
      runGit(root),
    );
    const lines = [
      ...plan.notes.map((note) => `prune: ${note}`),
      ...(yes
        ? applyPrune(root, plan.automatic, facts.knowledgeDir)
        : plan.automatic.map((removal) => formatLine("would remove", removal))),
      ...plan.held.map((removal) => formatLine("kept", removal)),
      ...(stale
        ? applyPrune(root, plan.ask, facts.knowledgeDir)
        : plan.ask.map((removal) => formatLine("ask", removal))),
    ];
    const removed = lines.filter((line) => line.startsWith("removed ")).length;
    const summary = yes
      ? `prune: removed ${removed}, ${stale ? 0 : plan.ask.length} to ask (${YES_FLAG} ${STALE_FLAG}), ${plan.held.length} done but kept`
      : `prune: ${plan.automatic.length} to remove (${YES_FLAG}), ${plan.ask.length} to ask (${YES_FLAG} ${STALE_FLAG}), ${plan.held.length} done but kept`;
    process.stdout.write(`${[...lines, summary].join("\n")}\n`);
    if (lines.some((line) => line.startsWith("not removed "))) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
