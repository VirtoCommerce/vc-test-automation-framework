import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { probeBrowserServer, serverPackage } from "../../../bin/lib/mcp-probe.mjs";
import { checkAdminToken, checkReachable, formatTable, request, runReadiness } from "../../../bin/lib/readiness.mjs";
import { maskSecrets } from "../../../bin/lib/redact.mjs";

const FIXTURES = join(import.meta.dirname, "fixtures");
const PASSWORD = "Sup3r-Secret!";
const FAST = { attempts: 3, delayMs: 1 };

type Handler = (incoming: IncomingMessage, response: ServerResponse, body: string) => void;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(String((server.address() as AddressInfo).port));
    });
  });
}

function withBody(handler: Handler): (incoming: IncomingMessage, response: ServerResponse) => void {
  return (incoming, response) => {
    let body = "";
    incoming.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    incoming.on("end", () => {
      handler(incoming, response, body);
    });
  };
}

async function httpServer(handler: Handler): Promise<{ url: string; close(): Promise<void> }> {
  const server = createHttpServer(withBody(handler));
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function reply(response: ServerResponse, status: number, body = ""): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body);
}

function refused(): Promise<never> {
  return Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
}

type Call = { command: string; args: string[]; cwd: string; env?: Record<string, string> };

function fakeExec(results: Record<string, { status: number; output: string }> = {}) {
  const calls: Call[] = [];
  return {
    calls,
    exec(command: string, args: string[], cwd: string, env?: Record<string, string>) {
      calls.push({ command, args, cwd, ...(env === undefined ? {} : { env }) });
      return results[[command, ...args].join(" ")] ?? { status: 0, output: "" };
    },
  };
}

function vars(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    BACKEND_BASE_URL: "http://backend.test",
    FRONTEND_BASE_URL: "http://frontend.test",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: PASSWORD,
    VERIFY_SSL: "true",
    ...overrides,
  };
}

function statusOf(rows: { check: string; status: string; detail: string }[], check: string) {
  const row = rows.find((candidate) => candidate.check === check);
  return row === undefined ? undefined : `${row.status}: ${row.detail}`;
}

test.describe("checkReachable", () => {
  test("is ok when the platform answers after a 503", async () => {
    let count = 0;
    const server = await httpServer((_incoming, response) => {
      count += 1;
      reply(response, count === 1 ? 503 : 200);
    });
    try {
      const result = await checkReachable(server.url, { verifySsl: true, ...FAST });

      expect(result.ok).toBe(true);
      expect(count).toBe(2);
    } finally {
      await server.close();
    }
  });

  test("fails with the status the platform answered last", async () => {
    const server = await httpServer((_incoming, response) => reply(response, 502));
    try {
      const result = await checkReachable(server.url, { verifySsl: true, ...FAST });

      expect(result.ok).toBe(false);
      expect(result.certificate).toBe(false);
      expect(result.detail).toContain("502");
    } finally {
      await server.close();
    }
  });

  test("fails on a refused connection naming ECONNREFUSED, not as a certificate problem", async () => {
    const server = await httpServer((_incoming, response) => reply(response, 200));
    const { url } = server;
    await server.close();

    const result = await checkReachable(url, { verifySsl: true, ...FAST });

    expect(result.ok).toBe(false);
    expect(result.certificate).toBe(false);
    expect(result.detail).toContain("ECONNREFUSED");
  });

  test("fails as a certificate problem on a self-signed certificate and passes without verification", async () => {
    const server = createHttpsServer(
      {
        key: readFileSync(join(FIXTURES, "test-only-localhost.key.pem")),
        cert: readFileSync(join(FIXTURES, "test-only-localhost.cert.pem")),
      },
      (_incoming, response) => reply(response, 200),
    );
    const port = await listen(server);
    try {
      const url = `https://localhost:${port}`;

      const strict = await checkReachable(url, { verifySsl: true, ...FAST });
      const relaxed = await checkReachable(url, { verifySsl: false, ...FAST });

      expect(strict.ok).toBe(false);
      expect(strict.certificate).toBe(true);
      expect(strict.detail).toContain("VERIFY_SSL=false");
      expect(relaxed.ok).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

test.describe("checkReachable, certificate errors", () => {
  function failing(code: string) {
    return () => Promise.reject(Object.assign(new Error(code), { code }));
  }

  test("takes CERT_UNTRUSTED as a certificate problem", async () => {
    const result = await checkReachable("https://b.test", {
      verifySsl: true,
      ...FAST,
      request: failing("CERT_UNTRUSTED"),
    });

    expect(result.certificate).toBe(true);
    expect(result.detail).toContain("VERIFY_SSL=false");
  });

  test("says a certificate for another host does not match, without offering VERIFY_SSL", async () => {
    const result = await checkReachable("https://b.test", {
      verifySsl: true,
      ...FAST,
      request: failing("ERR_TLS_CERT_ALTNAME_INVALID"),
    });

    expect(result.ok).toBe(false);
    expect(result.certificate).toBe(false);
    expect(result.detail).toContain("does not match its host");
    expect(result.detail).not.toContain("VERIFY_SSL");
  });
});

test.describe("checkAdminToken", () => {
  test("is ok on a 200 with an access token, sending a password grant as a form", async () => {
    let seen = { method: "", path: "", type: "", body: "" };
    const server = await httpServer((incoming, response, body) => {
      seen = {
        method: incoming.method ?? "",
        path: incoming.url ?? "",
        type: incoming.headers["content-type"] ?? "",
        body,
      };
      reply(response, 200, JSON.stringify({ access_token: "token", token_type: "Bearer" }));
    });
    try {
      const result = await checkAdminToken(
        server.url,
        { username: "admin", password: PASSWORD },
        { verifySsl: true, request },
      );

      expect(result.ok).toBe(true);
      expect(seen.method).toBe("POST");
      expect(seen.path).toBe("/connect/token");
      expect(seen.type).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(seen.body))).toMatchObject({
        grant_type: "password",
        username: "admin",
        password: PASSWORD,
      });
      expect(result.detail).not.toContain(PASSWORD);
    } finally {
      await server.close();
    }
  });

  test("fails on a 400 and never puts the password in the detail", async () => {
    const server = await httpServer((_incoming, response, body) => reply(response, 400, body));
    try {
      const result = await checkAdminToken(server.url, { username: "admin", password: PASSWORD }, { verifySsl: true });

      expect(result.ok).toBe(false);
      expect(result.detail).toContain("400");
      expect(result.detail).toContain("ADMIN_PASSWORD");
      expect(result.detail).not.toContain(PASSWORD);
    } finally {
      await server.close();
    }
  });

  for (const status of [401, 404, 405, 500]) {
    test(`on ${status} points at ${status === 401 ? "the credentials" : "BACKEND_BASE_URL"}`, async () => {
      const result = await checkAdminToken(
        "http://backend.test",
        { username: "admin", password: PASSWORD },
        { verifySsl: true, request: () => Promise.resolve({ status, body: "" }) },
      );

      expect(result.ok).toBe(false);
      if (status === 401) {
        expect(result.detail).toContain("check ADMIN_USERNAME and ADMIN_PASSWORD");
      } else {
        expect(result.detail).toContain(
          `the platform has no /connect/token at BACKEND_BASE_URL (it answered ${status})`,
        );
        expect(result.detail).not.toContain("ADMIN_PASSWORD");
      }
    });
  }
});

test.describe("runReadiness", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc readiness "));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("lists the rows in order and skips what needs a backend that does not answer", async () => {
    const { exec, calls } = fakeExec();
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars(),
      skipInstall: false,
      skipVerify: false,
      exec,
      request: (url: string) =>
        url.startsWith("http://frontend.test") ? Promise.resolve({ status: 200, body: "" }) : refused(),
      probe: () => Promise.resolve({ ok: true, detail: "opened the frontend" }),
      attempts: 1,
      delayMs: 0,
    });

    expect(rows.map((row) => row.check)).toEqual([
      "backend",
      "frontend",
      "administrator",
      "project facts",
      "types",
      "first test",
      "browser server",
    ]);
    expect(statusOf(rows, "backend")).toMatch(/^fail: .*ECONNREFUSED/);
    for (const check of ["administrator", "types", "first test"]) {
      expect(statusOf(rows, check)).toBe("skipped: the platform does not answer");
    }
    expect(statusOf(rows, "frontend")).toMatch(/^ok/);
    expect(statusOf(rows, "browser server")).toMatch(/^ok/);
    expect(calls.map((call) => [call.command, ...call.args].join(" "))).toEqual([
      "node .claude/checks/project-facts.mts",
    ]);
  });

  test("with skipVerify skips every network row and the browser server and still checks the project facts", async () => {
    const { exec, calls } = fakeExec();
    let requests = 0;
    let probes = 0;
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: "tests-suite",
      vars: vars(),
      skipInstall: false,
      skipVerify: true,
      exec,
      request: () => {
        requests += 1;
        return Promise.resolve({ status: 200, body: "" });
      },
      probe: () => {
        probes += 1;
        return Promise.resolve({ ok: true, detail: "" });
      },
    });

    for (const check of ["backend", "frontend", "administrator", "types", "first test", "browser server"]) {
      expect(rows.find((row) => row.check === check)?.status).toBe("skipped");
    }
    expect(statusOf(rows, "project facts")).toMatch(/^ok/);
    expect(calls).toEqual([{ command: "node", args: [".claude/checks/project-facts.mts"], cwd: dir }]);
    expect(requests).toBe(0);
    expect(probes).toBe(0);
  });

  test("with an empty ADMIN_PASSWORD skips the administrator, types and first test without a token request", async () => {
    const { exec, calls } = fakeExec();
    const urls: string[] = [];
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars({ ADMIN_PASSWORD: "" }),
      skipInstall: false,
      skipVerify: false,
      exec,
      request: (url: string) => {
        urls.push(url);
        return Promise.resolve({ status: 200, body: "" });
      },
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    for (const check of ["administrator", "types", "first test"]) {
      expect(statusOf(rows, check)).toMatch(/^skipped: ADMIN_PASSWORD/);
    }
    expect(urls.some((url) => url.includes("/connect/token"))).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test("runs codegen and the first test in the suite when everything before them passes", async () => {
    const { exec, calls } = fakeExec();
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: "suite",
      vars: vars(),
      skipInstall: false,
      skipVerify: false,
      exec,
      request: (url: string) =>
        Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        ),
      probe: () => Promise.resolve({ ok: true, detail: "opened the frontend" }),
    });

    expect(rows.every((row) => row.status === "ok")).toBe(true);
    expect(calls.slice(1)).toEqual([
      { command: "npm", args: ["run", "codegen"], cwd: join(dir, "suite") },
      { command: "npm", args: ["test"], cwd: join(dir, "suite") },
    ]);
  });

  test("skips the first test when the administrator cannot sign in or the types fail", async () => {
    const failingTypes = fakeExec({ "npm run codegen": { status: 1, output: "Error: schema missing" } });
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars(),
      skipInstall: false,
      skipVerify: false,
      exec: failingTypes.exec,
      request: (url: string) =>
        Promise.resolve(url.endsWith("/connect/token") ? { status: 400, body: "" } : { status: 200, body: "" }),
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(statusOf(rows, "administrator")).toMatch(/^fail: /);
    expect(statusOf(rows, "types")).toMatch(/^fail: /);
    expect(statusOf(rows, "first test")).toMatch(/^skipped: /);
    expect(failingTypes.calls.map((call) => call.args.join(" "))).not.toContain("test");
  });

  test("with skipInstall skips the types and the first test", async () => {
    const { exec, calls } = fakeExec();
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars(),
      skipInstall: true,
      skipVerify: false,
      exec,
      request: (url: string) =>
        Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        ),
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(statusOf(rows, "types")).toMatch(/^skipped: .*--skip-install/);
    expect(statusOf(rows, "first test")).toMatch(/^skipped: .*--skip-install/);
    expect(calls).toHaveLength(1);
  });

  test("skips the project facts row when only @babel/parser is missing, and fails it otherwise", async () => {
    const missing = fakeExec({
      "node .claude/checks/project-facts.mts": {
        status: 1,
        output: "project.json: the Playwright projects cannot be read: @babel/parser is not installed",
      },
    });
    const broken = fakeExec({
      "node .claude/checks/project-facts.mts": {
        status: 1,
        output: [
          "project-facts: the suite's projects were not checked: @babel/parser is not installed",
          "project.json: tracker.kind is missing",
          "    at fail (project-facts.mts:70:9)",
        ].join("\n"),
      },
    });
    const context = {
      projectDir: dir,
      suiteDir: ".",
      vars: vars(),
      skipInstall: true,
      skipVerify: true,
    };

    const skipped = await runReadiness({ ...context, exec: missing.exec });
    const failed = await runReadiness({ ...context, exec: broken.exec });

    expect(statusOf(skipped, "project facts")).toBe("skipped: dependencies not installed");
    expect(statusOf(failed, "project facts")).toMatch(/^fail: project\.json: tracker\.kind is missing/);
    expect(statusOf(failed, "project facts")).not.toContain(" at ");
  });

  test("offers VERIFY_SSL=false on an untrusted certificate, writes it to .env and checks again", async () => {
    mkdirSync(join(dir, "suite"));
    writeFileSync(join(dir, "suite", ".env"), "BACKEND_BASE_URL=https://backend.test\nVERIFY_SSL=true\n");
    const questions: string[] = [];
    const seen: boolean[] = [];
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: "suite",
      vars: vars({ BACKEND_BASE_URL: "https://backend.test" }),
      skipInstall: true,
      skipVerify: false,
      exec: fakeExec().exec,
      prompter: {
        ask: () => Promise.resolve(""),
        askSecret: () => Promise.resolve(""),
        confirm(text: string) {
          questions.push(text);
          return Promise.resolve(true);
        },
        close() {},
      },
      request(url: string, options: { verifySsl: boolean }) {
        if (url.startsWith("https://backend.test") && !url.endsWith("/connect/token")) {
          seen.push(options.verifySsl);
        }
        if (url.startsWith("https://backend.test") && options.verifySsl) {
          return Promise.reject(
            Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }),
          );
        }
        return Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        );
      },
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(questions).toEqual(["The certificate is not trusted (self-signed?). Set VERIFY_SSL=false in .env?"]);
    expect(readFileSync(join(dir, "suite", ".env"), "utf8")).toBe(
      "BACKEND_BASE_URL=https://backend.test\nVERIFY_SSL=false\n",
    );
    expect(seen).toEqual([true, false]);
    expect(statusOf(rows, "backend")).toMatch(/^ok/);
    expect(statusOf(rows, "administrator")).toMatch(/^ok/);
  });

  test("with VERIFY_SSL=false, codegen and the first test run with certificate checks off, and not otherwise", async () => {
    const answered = (url: string) =>
      Promise.resolve(
        url.endsWith("/connect/token")
          ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
          : { status: 200, body: "" },
      );
    const relaxed = fakeExec();
    const strict = fakeExec();
    const context = {
      projectDir: dir,
      suiteDir: ".",
      skipInstall: false,
      skipVerify: false,
      request: answered,
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    };

    await runReadiness({ ...context, vars: vars({ VERIFY_SSL: "false" }), exec: relaxed.exec });
    await runReadiness({ ...context, vars: vars(), exec: strict.exec });

    expect(relaxed.calls.map((call) => call.env)).toEqual([
      undefined,
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    ]);
    expect(strict.calls.map((call) => call.env)).toEqual([undefined, undefined, undefined]);
  });

  test("after VERIFY_SSL=false is accepted, codegen runs with certificate checks off", async () => {
    writeFileSync(join(dir, ".env"), "VERIFY_SSL=true\n");
    const { exec, calls } = fakeExec();
    await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars({ BACKEND_BASE_URL: "https://backend.test" }),
      skipInstall: false,
      skipVerify: false,
      exec,
      prompter: {
        ask: () => Promise.resolve(""),
        askSecret: () => Promise.resolve(""),
        confirm: () => Promise.resolve(true),
        close() {},
      },
      request(url: string, options: { verifySsl: boolean }) {
        if (url.startsWith("https://backend.test") && options.verifySsl) {
          return Promise.reject(Object.assign(new Error("self-signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }));
        }
        return Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        );
      },
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(calls[1]).toMatchObject({ args: ["run", "codegen"], env: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  });

  test("hands the probe the password names it must not pass on", async () => {
    const seen: unknown[] = [];
    await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars(),
      skipInstall: true,
      skipVerify: false,
      exec: fakeExec().exec,
      withheld: ["ADMIN_PASSWORD"],
      request: () => Promise.resolve({ status: 200, body: "" }),
      probe(options: { withheld: string[] }) {
        seen.push(options.withheld);
        return Promise.resolve({ ok: true, detail: "" });
      },
    });

    expect(seen).toEqual([["ADMIN_PASSWORD"]]);
  });

  test("masks the value of every variable passwordFor names, whatever its name", async () => {
    mkdirSync(join(dir, ".qa"));
    writeFileSync(join(dir, ".qa", "project.json"), JSON.stringify({ passwordFor: { buyer: "BUYER_PIN" } }));
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: ".",
      vars: vars({ BUYER_PIN: "pin-4711" }),
      skipInstall: false,
      skipVerify: false,
      exec: fakeExec({ "npm run codegen": { status: 1, output: "Error: rejected pin-4711 for the buyer" } }).exec,
      request: (url: string) =>
        Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        ),
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(statusOf(rows, "types")).toContain("rejected *** for the buyer");
  });

  test("takes a cancelled certificate question as a no: the backend row fails with its own detail", async () => {
    mkdirSync(join(dir, "suite"));
    writeFileSync(join(dir, "suite", ".env"), "BACKEND_BASE_URL=https://backend.test\nVERIFY_SSL=true\n");
    const rows = await runReadiness({
      projectDir: dir,
      suiteDir: "suite",
      vars: vars({ BACKEND_BASE_URL: "https://backend.test" }),
      skipInstall: true,
      skipVerify: false,
      exec: fakeExec().exec,
      prompter: {
        ask: () => Promise.resolve(""),
        askSecret: () => Promise.resolve(""),
        confirm: () => Promise.reject(new Error("cancelled")),
        close() {},
      },
      request: (url: string) =>
        url.startsWith("https://backend.test")
          ? Promise.reject(Object.assign(new Error("self-signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }))
          : Promise.resolve({ status: 200, body: "" }),
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(statusOf(rows, "backend")).toMatch(/^fail: the certificate of https:\/\/backend\.test is not trusted/);
    expect(readFileSync(join(dir, "suite", ".env"), "utf8")).toContain("VERIFY_SSL=true\n");
  });
});

test.describe("password masking", () => {
  test("keeps text the code writes and masks a password only as a whole token in child output", async () => {
    const rows = await runReadiness({
      projectDir: ".",
      suiteDir: ".",
      vars: vars({ ADMIN_PASSWORD: "store", FRONTEND_BASE_URL: "http://storefront.test" }),
      skipInstall: false,
      skipVerify: false,
      exec: fakeExec({
        "npm run codegen": { status: 1, output: "Error: login failed with password=store for storefront" },
      }).exec,
      request: (url: string) =>
        Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        ),
      probe: () => Promise.resolve({ ok: true, detail: "opened http://storefront.test through the browser server" }),
    });

    expect(statusOf(rows, "frontend")).toBe("ok: http://storefront.test answers (200)");
    expect(statusOf(rows, "browser server")).toContain("http://storefront.test");
    expect(statusOf(rows, "types")).toContain("password=*** for storefront");
    expect(formatTable(rows)).toContain("http://storefront.test answers");
  });

  for (const form of [
    "https://user:store@host/x",
    "password=store,",
    "(store)",
    "store.",
    "password=store;",
    "key=store}",
    "?password=store&a=1",
  ]) {
    test(`masks the password in ${form}`, () => {
      const masked = maskSecrets(`said ${form} and storefront`, ["store"]);

      expect(masked).toBe(`said ${form.replace("store", "***")} and storefront`);
    });
  }

  test("masks a password at the 200-character cut instead of leaving its prefix", async () => {
    const rows = await runReadiness({
      projectDir: ".",
      suiteDir: ".",
      vars: vars({ ADMIN_PASSWORD: "Pa55word-long" }),
      skipInstall: false,
      skipVerify: false,
      exec: fakeExec({ "npm run codegen": { status: 1, output: `Error ${"x".repeat(190)} Pa55word-long` } }).exec,
      request: (url: string) =>
        Promise.resolve(
          url.endsWith("/connect/token")
            ? { status: 200, body: JSON.stringify({ access_token: "t" }) }
            : { status: 200, body: "" },
        ),
      probe: () => Promise.resolve({ ok: true, detail: "" }),
    });

    expect(statusOf(rows, "types")).toContain(`${"x".repeat(190)} ***`);
    expect(statusOf(rows, "types")).not.toContain("Pa55");
  });
});

test.describe("formatTable", () => {
  test("prints one line per row with the status first and masks a password-looking value", () => {
    const text = formatTable([
      { check: "backend", status: "ok", detail: "http://backend.test answers" },
      { check: "administrator", status: "fail", detail: `the platform said password=${PASSWORD}` },
      { check: "types", status: "skipped", detail: "the platform does not answer" },
    ]);
    const lines = text.trimEnd().split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^ok\s+backend\s+http:\/\/backend\.test answers$/);
    expect(lines[1]).toMatch(/^fail\s+administrator\s+/);
    expect(lines[2]).toMatch(/^skipped\s+types\s+the platform does not answer$/);
    expect(text).not.toContain(PASSWORD);
  });
});

const FAKE_SERVER = String.raw`import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

export const BROWSER_SERVER_PACKAGE = "@playwright/mcp@9.9.9";
const MODE = "__MODE__";
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync("server.pid", String(process.pid));
writeFileSync("grandchild.pid", String(grandchild.pid));
let navigations = 0;
function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
}
function missing(id) {
  send({ id, result: { isError: true, content: [{ type: "text", text: "Executable doesn't exist at chromium" }] } });
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  appendFileSync("calls.log", (message.params?.name ?? message.method) + "\n");
  if (message.method === "initialize") {
    send({ id: message.id, method: "roots/list", params: {} });
    send({ id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: {}, serverInfo: { name: "fake" } } });
  } else if (message.method === "tools/call" && message.params.name === "browser_navigate") {
    navigations += 1;
    if ((MODE === "missing-once" && navigations === 1) || MODE === "missing-always") {
      missing(message.id);
    } else {
      send({ id: message.id, result: { content: [{ type: "text", text: "navigated to " + message.params.arguments.url }] } });
    }
  } else if (message.method === "tools/call" && message.params.name === "browser_install") {
    send({ id: message.id, result: { content: [{ type: "text", text: "installed" }] } });
  }
});
setInterval(() => {}, 1000);
`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.describe("probeBrowserServer", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc probe "));
    mkdirSync(join(dir, ".claude", "checks"), { recursive: true });
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function pidIn(name: string): number {
    return Number(readFileSync(join(dir, name), "utf8"));
  }

  for (const missing of [false, true]) {
    test(`opens the frontend through the launcher and stops its whole tree${missing ? ", installing a missing browser once" : ""}`, async () => {
      writeFileSync(
        join(dir, ".claude", "checks", "browser-mcp.mts"),
        FAKE_SERVER.replace("__MODE__", missing ? "missing-once" : "ok"),
      );

      const result = await probeBrowserServer({
        projectDir: dir,
        frontendUrl: "http://frontend.test",
        timeoutMs: 20_000,
      });

      expect(result).toEqual({ ok: true, detail: "opened http://frontend.test through the browser server" });
      const calls = readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n");
      expect(calls).toEqual(
        missing
          ? ["initialize", "notifications/initialized", "browser_navigate", "browser_install", "browser_navigate"]
          : ["initialize", "notifications/initialized", "browser_navigate"],
      );
      expect(alive(pidIn("server.pid"))).toBe(false);
      expect(alive(pidIn("grandchild.pid"))).toBe(false);
    });
  }

  test("names the launcher's pinned package when the browser is still missing after the install", async () => {
    writeFileSync(join(dir, ".claude", "checks", "browser-mcp.mts"), FAKE_SERVER.replace("__MODE__", "missing-always"));

    const result = await probeBrowserServer({
      projectDir: dir,
      frontendUrl: "http://frontend.test",
      timeoutMs: 20_000,
    });

    expect(result).toEqual({
      ok: false,
      detail:
        "the browser server has no browser and could not install it; run npx -y @playwright/mcp@9.9.9 install-browser chromium.",
    });
  });

  test("reads the pinned package of the launcher, and names the bare package when it cannot", () => {
    writeFileSync(join(dir, ".claude", "checks", "browser-mcp.mts"), FAKE_SERVER);

    expect(serverPackage(dir)).toBe("@playwright/mcp@9.9.9");
    expect(serverPackage(join(dir, "missing"))).toBe("@playwright/mcp");
  });

  test("starts the launcher without the passwords it must not pass on, and with the others", async () => {
    writeFileSync(
      join(dir, ".claude", "checks", "browser-mcp.mts"),
      'import { writeFileSync } from "node:fs";\nwriteFileSync("env-names.json", JSON.stringify(Object.keys(process.env)));\n',
    );
    const before = {
      ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"],
      CUSTOMER_PASSWORD: process.env["CUSTOMER_PASSWORD"],
    };
    process.env["ADMIN_PASSWORD"] = "shell-only";
    process.env["CUSTOMER_PASSWORD"] = "saved";
    try {
      await probeBrowserServer({
        projectDir: dir,
        frontendUrl: "http://frontend.test",
        timeoutMs: 20_000,
        withheld: ["ADMIN_PASSWORD"],
      });
    } finally {
      for (const [name, value] of Object.entries(before)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }

    const names = JSON.parse(readFileSync(join(dir, "env-names.json"), "utf8")) as string[];
    expect(names.map((name) => name.toUpperCase())).not.toContain("ADMIN_PASSWORD");
    expect(names).toContain("CUSTOMER_PASSWORD");
  });

  test("masks a password in the launcher's error output", async () => {
    writeFileSync(
      join(dir, ".claude", "checks", "browser-mcp.mts"),
      'throw new Error("bad config password=store for storefront");\n',
    );

    const result = await probeBrowserServer({
      projectDir: dir,
      frontendUrl: "http://storefront.test",
      timeoutMs: 20_000,
      secrets: ["store"],
    });

    expect(result.detail).toContain("password=*** for storefront");
  });

  test("fails naming the launcher's error when it stops", async () => {
    writeFileSync(
      join(dir, ".claude", "checks", "browser-mcp.mts"),
      'throw new Error("the server package is missing");\n',
    );

    const result = await probeBrowserServer({
      projectDir: dir,
      frontendUrl: "http://frontend.test",
      timeoutMs: 20_000,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Error: the server package is missing");
    expect(result.detail).toContain("node .claude/checks/browser-mcp.mts");
  });

  test("fails with the fix when the launcher does not answer in time", async () => {
    writeFileSync(
      join(dir, ".claude", "checks", "browser-mcp.mts"),
      'import { writeFileSync } from "node:fs";\nwriteFileSync("server.pid", String(process.pid));\nsetInterval(() => {}, 1000);\n',
    );

    const result = await probeBrowserServer({ projectDir: dir, frontendUrl: "http://frontend.test", timeoutMs: 1_000 });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("node .claude/checks/browser-mcp.mts");
    expect(alive(pidIn("server.pid"))).toBe(false);
  });
});
