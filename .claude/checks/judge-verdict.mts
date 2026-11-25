import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

export const JUDGE_ROLES = ["planner", "expert", "explorer", "healer", "coverage"] as const;

export type JudgeRole = (typeof JUDGE_ROLES)[number];

export type JudgeVerdict = {
  role: JudgeRole;
  subject: string;
  criteria: { name: string; pass: boolean; evidence: string }[];
  verdict: "pass" | "fail";
};

const CLI_FILE_NAME = "judge-verdict.mts";
const DEFAULT_CRITERIA_DIR = ".claude/skills/judge-criteria";
const CRITERION_LINE = /^- `([a-z][a-z0-9-]*)`/;
const PROOF_ROLE: JudgeRole = "expert";
const PROOF_CRITERION = "fails-when-behaviour-breaks";
const PROOF_KINDS = ["mechanical", "reasoned"] as const;

function problem(text: string): string {
  return `judge verdict: ${text}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is JudgeRole {
  return JUDGE_ROLES.some((role) => role === value);
}

/**
 * The criteria of a role, in the order its file lists them: every list line that starts with a name in backticks.
 *
 * @throws Error when the role's file cannot be read or lists no criteria.
 */
export function criteriaOf(role: JudgeRole, directory: string = DEFAULT_CRITERIA_DIR): string[] {
  const file = join(directory, `${role}.md`);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(problem(`the criteria file ${file} cannot be read`));
  }
  const names = text.split(/\r?\n/).flatMap((line) => CRITERION_LINE.exec(line)?.[1] ?? []);
  if (names.length === 0) {
    throw new Error(problem(`the criteria file ${file} lists no criteria`));
  }
  return names;
}

/**
 * The expert's verdict records how its cases were proved: `proofs` holds the whole numbers `mechanical` (cases proved
 * with `prove-fails`) and `reasoned` (cases judged from the assertion), at least one case in all. Without a single
 * mechanical proof the criterion `fails-when-behaviour-breaks` may pass only with a non-empty `proofs.explanation` of why none
 * could be.
 */
function proofProblems(json: Record<string, unknown>, criteria: readonly unknown[]): string[] {
  const proofs = json["proofs"];
  if (!isRecord(proofs)) {
    return [
      problem(
        `proofs is missing: write "proofs": { "mechanical": <cases proved with prove-fails>, "reasoned": <cases judged from the assertion>, "explanation": "<why none could be proved, when mechanical is 0>" }`,
      ),
    ];
  }
  const counts = PROOF_KINDS.map((kind) => proofs[kind]);
  const bad = PROOF_KINDS.filter((_, index) => !Number.isInteger(counts[index]) || Number(counts[index]) < 0);
  if (bad.length > 0) {
    return bad.map((kind) => problem(`proofs.${kind} is not a whole number of cases`));
  }
  const [mechanical = 0, reasoned = 0] = counts.map(Number);
  if (mechanical + reasoned === 0) {
    return [problem("proofs counts no case")];
  }
  const explanation = typeof proofs["explanation"] === "string" ? proofs["explanation"].trim() : "";
  const answer = criteria.find((entry) => isRecord(entry) && entry["name"] === PROOF_CRITERION);
  return mechanical === 0 && explanation === "" && isRecord(answer) && answer["pass"] === true
    ? [
        problem(
          `criterion "${PROOF_CRITERION}" passes with no case proved mechanically and no proofs.explanation saying why`,
        ),
      ]
    : [];
}

type Criterion = { name: string; pass: boolean | undefined; evidence: unknown };

function criteriaProblems(entries: readonly unknown[], expected: readonly string[], role: JudgeRole): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const parsed: Criterion[] = [];
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      problems.push(problem(`criteria[${index}] is not an object`));
      return;
    }
    const name = typeof entry["name"] === "string" ? entry["name"] : "";
    const pass = entry["pass"];
    parsed.push({ name, pass: typeof pass === "boolean" ? pass : undefined, evidence: entry["evidence"] });
    if (seen.has(name)) {
      problems.push(problem(`criterion "${name}" appears twice`));
    }
    seen.add(name);
  });
  for (const name of expected.filter((wanted) => !seen.has(wanted))) {
    problems.push(problem(`criterion "${name}" is missing`));
  }
  for (const criterion of parsed) {
    if (!expected.includes(criterion.name)) {
      problems.push(problem(`criterion "${criterion.name}" is not a criterion of the ${role}`));
    } else if (criterion.pass === undefined) {
      problems.push(problem(`criterion "${criterion.name}" has no true or false pass`));
    } else if (typeof criterion.evidence !== "string" || criterion.evidence.trim() === "") {
      problems.push(problem(`criterion "${criterion.name}" has no evidence`));
    }
  }
  return problems;
}

/**
 * Checks a judge's verdict file against its role's criteria file: the role matches, the subject is named, every
 * criterion of the role answered once with true or false and non-empty evidence, no other criterion, the verdict is
 * `pass` exactly when every criterion passes, and, for the expert, the `proofs` record of `proofProblems`. Returns one line per problem; an empty list is a good file.
 *
 * @throws Error when the role's criteria file cannot be read or lists no criteria.
 */
export function checkJudgeVerdict(json: unknown, role: JudgeRole, directory: string = DEFAULT_CRITERIA_DIR): string[] {
  if (!isRecord(json)) {
    return [problem("not a JSON object")];
  }
  const problems: string[] = [];
  if (json["role"] !== role) {
    problems.push(problem(`role is ${JSON.stringify(json["role"])}, expected "${role}"`));
  }
  const subject = json["subject"];
  if (typeof subject !== "string" || subject.trim() === "") {
    problems.push(problem("subject is not a non-empty string"));
  }
  const verdict = json["verdict"];
  if (verdict !== "pass" && verdict !== "fail") {
    problems.push(problem('verdict is not "pass" or "fail"'));
  }
  const criteria = json["criteria"];
  if (!Array.isArray(criteria)) {
    problems.push(problem("criteria is not a list"));
    return problems;
  }
  problems.push(...criteriaProblems(criteria, criteriaOf(role, directory), role));
  if (role === PROOF_ROLE) {
    problems.push(...proofProblems(json, criteria));
  }
  const answers = criteria.flatMap((entry) => (isRecord(entry) && typeof entry["pass"] === "boolean" ? [entry] : []));
  const failed = answers.find((entry) => entry["pass"] === false);
  if (verdict === "pass" && failed !== undefined) {
    problems.push(problem(`verdict is "pass" but criterion "${String(failed["name"])}" failed`));
  }
  if (verdict === "fail" && answers.length === criteria.length && failed === undefined && problems.length === 0) {
    problems.push(problem('verdict is "fail" but every criterion passed'));
  }
  return problems;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(problem(`${file} cannot be read`));
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(problem(`${file} is not valid JSON`));
  }
}

function roleOf(json: unknown, argument: string | undefined): JudgeRole {
  const role = argument ?? (isRecord(json) ? json["role"] : undefined);
  if (!isRole(role)) {
    throw new Error(problem(`role ${JSON.stringify(role)} is not one of ${JUDGE_ROLES.join(", ")}`));
  }
  return role;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [command, file, roleArgument] = process.argv.slice(2);
    if (command !== "check" || file === undefined) {
      throw new Error(problem("usage is node .claude/checks/judge-verdict.mts check <file> [role]"));
    }
    const json = readJson(file);
    const problems = checkJudgeVerdict(json, roleOf(json, roleArgument));
    if (problems.length === 0) {
      process.stdout.write("ok\n");
    } else {
      process.stderr.write(`${problems.join("\n")}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
