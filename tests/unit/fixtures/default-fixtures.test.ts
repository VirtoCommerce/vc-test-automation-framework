import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Env } from "@/core";
import type { DefaultFixtures, DefaultWorkerFixtures } from "@/fixtures";
import type { ModuleRequirement } from "@/modules";

import { createServer } from "node:http";

import { test as base, expect } from "@playwright/test";

import { defaultFixtures } from "@/fixtures";

import { testEnv } from "../core/test-env.ts";

interface FakePlatform {
  readonly url: string;
  readonly passwordGrants: () => number;
  readonly moduleReads: () => number;
}

const MODULES = [
  { id: "VirtoCommerce.Catalog", version: "3.1000.0", isInstalled: true },
  { id: "VirtoCommerce.Quote", version: "3.900.0", isInstalled: true },
  { id: "VirtoCommerce.Uninstalled", version: "3.1000.0", isInstalled: false },
];

const CATALOG: ModuleRequirement = { id: "VirtoCommerce.Catalog" };
const QUOTES: ModuleRequirement = { id: "VirtoCommerce.Quote", minVersion: "3.900.0" };
const NEWER_QUOTES: ModuleRequirement = { id: "VirtoCommerce.Quote", minVersion: "3.1000.0" };
const UNINSTALLED: ModuleRequirement = { id: "VirtoCommerce.Uninstalled" };

const test = base
  .extend<DefaultFixtures, DefaultWorkerFixtures<Env>>(defaultFixtures(testEnv()))
  .extend<object, { platform: FakePlatform }>({
    platform: [
      async ({}, use) => {
        let grants = 0;
        let moduleReads = 0;
        const server = createServer((incoming: IncomingMessage, outgoing: ServerResponse) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            const path = incoming.url ?? "";
            const form = new URLSearchParams(Buffer.concat(chunks).toString());
            const bearer = incoming.headers.authorization?.replace(/^Bearer /, "");
            const json = (status: number, body: unknown) =>
              outgoing.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
            if (path === "/connect/token") {
              grants += 1;
              json(200, {
                access_token: `token-of-${form.get("username")}`,
                token_type: "Bearer",
                expires_in: 1_800,
                refresh_token: `refresh-of-${form.get("username")}`,
              });
            } else if (path === "/revoke/token") {
              json(200, {});
            } else if (bearer === undefined) {
              json(401, {});
            } else if (path === "/api/platform/modules") {
              moduleReads += 1;
              json(200, MODULES);
            } else if (path === "/api/platform/security/currentuser") {
              json(200, { userName: bearer.replace(/^token-of-/, "") });
            } else {
              json(404, {});
            }
          });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        await use({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          passwordGrants: () => grants,
          moduleReads: () => moduleReads,
        });
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
      { scope: "worker" },
    ],
    env: [async ({ platform }, use) => use(testEnv({ BACKEND_BASE_URL: platform.url })), { scope: "worker" }],
  });

test.describe.configure({ mode: "default" });

test.describe("defaultFixtures without required modules", () => {
  test("checkModules sends no requests", ({ platform }) => {
    expect(platform.passwordGrants()).toBe(0);
    expect(platform.moduleReads()).toBe(0);
  });
});

test.describe("defaultFixtures clients", () => {
  test("workerAdmin is signed in as the administrator", async ({ workerAdmin, platform }) => {
    const response = await workerAdmin.get("/api/platform/security/currentuser");

    expect(response.json()).toEqual({ userName: "admin" });
    expect(platform.passwordGrants()).toBe(1);
  });

  test("signIn reuses the token that the worker has for a user", async ({ signIn, env, platform }) => {
    const administrator = await signIn({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
    await administrator.get("/api/platform/security/currentuser");

    expect(platform.passwordGrants()).toBe(1);
  });

  test("http sends requests without a token", async ({ http }) => {
    const response = await http.get("/api/platform/security/currentuser");

    expect(response.status).toBe(401);
  });

  test("signIn returns a client signed in as the user", async ({ signIn, env }) => {
    const manager = await signIn({ username: "manager", password: env.ADMIN_PASSWORD });

    expect((await manager.get("/api/platform/security/currentuser")).json()).toEqual({ userName: "manager" });
  });
});

test.describe("defaultFixtures checkModules", () => {
  test.describe("with modules that qualify", () => {
    test.use({ modules: { CATALOG, QUOTES } });

    test("runs the test", () => {
      expect(test.info().annotations.filter((annotation) => annotation.type === "skip")).toEqual([]);
    });
  });

  test.describe("with modules that do not qualify", () => {
    test.use({ modules: { UNINSTALLED, NEWER_QUOTES } });

    test.afterEach(({}, testInfo) => {
      expect(testInfo.status).toBe("skipped");
      expect(testInfo.annotations).toContainEqual(
        expect.objectContaining({
          type: "skip",
          description: expect.stringMatching(/VirtoCommerce\.Uninstalled.*; .*VirtoCommerce\.Quote 3\.900\.0/),
        }),
      );
    });

    test("skips the test with the reasons", () => {
      throw new Error("checkModules did not skip the test");
    });
  });

  test.describe("with an inner test.use", () => {
    test.use({ modules: { UNINSTALLED } });

    test.describe("that names other modules", () => {
      test.use({ modules: { CATALOG } });

      test("replaces the outer requirements", () => {
        expect(test.info().annotations.filter((annotation) => annotation.type === "skip")).toEqual([]);
      });
    });
  });
});
