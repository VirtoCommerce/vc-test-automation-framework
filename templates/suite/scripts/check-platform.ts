import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

const SWAGGER_PATH = "/docs/PlatformUI/swagger.json";
const REQUEST_TIMEOUT_MS = 10_000;

const ENV_FILE = new URL("../.env", import.meta.url);

if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

const { values } = parseArgs({
  options: { attempts: { type: "string", default: "4" }, "delay-ms": { type: "string", default: "5000" } },
});

function nonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    process.stderr.write(`--${name} must be a non-negative integer, got "${value}".\n`);
    process.exit(1);
  }
  return parsed;
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error && "code" in cause && typeof cause.code === "string") {
      return cause.code;
    }
    return error.name === "TimeoutError" ? "timeout" : error.message;
  }
  return String(error);
}

async function probe(url: URL): Promise<string | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return response.ok ? undefined : String(response.status);
  } catch (error) {
    return describeFailure(error);
  }
}

const attempts = Math.max(1, nonNegativeInteger(values.attempts, "attempts"));
const delayMs = nonNegativeInteger(values["delay-ms"], "delay-ms");
const base = process.env["BACKEND_BASE_URL"];

if (!base) {
  process.stderr.write("BACKEND_BASE_URL is not set. Set it in .env, then run npm run codegen again.\n");
  process.exit(1);
}

const parsed = URL.parse(base);

if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
  process.stderr.write(
    `BACKEND_BASE_URL "${base}" is not a valid http or https URL. Fix it in .env, then run npm run codegen again.
`,
  );
  process.exit(1);
}

const origin = parsed.origin;
const url = new URL(SWAGGER_PATH, origin);
let failure: string | undefined;

for (let attempt = 1; attempt <= attempts; attempt++) {
  failure = await probe(url);
  if (failure === undefined) {
    process.exit(0);
  }
  if (attempt < attempts) {
    await sleep(delayMs);
  }
}

process.stderr.write(
  `The platform at ${origin} did not answer GET ${SWAGGER_PATH} (${failure}) after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}. A platform that is still starting needs a minute: wait, then run npm run codegen again.\n`,
);
process.exit(1);
