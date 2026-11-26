import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const SCRIPT = fileURLToPath(new URL("../../../templates/suite/scripts/check-platform.ts", import.meta.url));
const SWAGGER_PATH = "/docs/PlatformUI/swagger.json";

interface Run {
  readonly status: number | null;
  readonly stderr: string;
}

interface Platform {
  readonly server: Server;
  readonly origin: string;
  readonly paths: string[];
}

function listen(statuses: readonly number[]): Promise<Platform> {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? "");
    response.writeHead(statuses[Math.min(paths.length - 1, statuses.length - 1)] ?? 503);
    response.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, paths });
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function run(env: Record<string, string>): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, "--attempts", "3", "--delay-ms", "10"], {
      env: { ...process.env, BACKEND_BASE_URL: "", ...env },
      cwd: tmpdir(),
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test.describe("check-platform", () => {
  test("exits 0 when a later attempt answers 2xx", async () => {
    const { server, origin, paths } = await listen([503, 503, 200]);
    try {
      const result = await run({ BACKEND_BASE_URL: origin });
      expect(result.status).toBe(0);
      expect(paths).toEqual([SWAGGER_PATH, SWAGGER_PATH, SWAGGER_PATH]);
    } finally {
      await close(server);
    }
  });

  test("names the origin, the path, the status and the wait when the platform keeps answering 503", async () => {
    const { server, origin } = await listen([503]);
    try {
      const result = await run({ BACKEND_BASE_URL: origin });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(origin);
      expect(result.stderr).toContain(SWAGGER_PATH);
      expect(result.stderr).toContain("503");
      expect(result.stderr).toContain("3 attempts");
      expect(result.stderr).toContain("still starting");
    } finally {
      await close(server);
    }
  });

  test("names the connection error when nothing listens", async () => {
    const { server, origin } = await listen([200]);
    await close(server);
    const result = await run({ BACKEND_BASE_URL: origin });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ECONNREFUSED");
    expect(result.stderr).toContain(origin);
  });

  test("names the variable when BACKEND_BASE_URL is unset", async () => {
    const result = await run({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("BACKEND_BASE_URL");
  });
});
