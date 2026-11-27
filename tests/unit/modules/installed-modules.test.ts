import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { HttpClient, HttpError } from "@/http";
import { compareModuleVersions, InstalledModules } from "@/modules";

const INSTALLED = new InstalledModules({ "VirtoCommerce.Catalog": "3.1034.0", "VirtoCommerce.Quote": "3.1010.0" });

test.describe("compareModuleVersions", () => {
  const CASES = [
    { left: "3.1034.0", right: "3.1012.1", sign: 1, title: "compares the parts as numbers" },
    { left: "3.1012.1", right: "3.1034.0", sign: -1, title: "finds the older version" },
    { left: "3.1034.2", right: "3.1034.10", sign: -1, title: "compares the patch as a number" },
    { left: "3.1034", right: "3.1034.0", sign: 0, title: "counts a missing part as 0" },
    { left: "3.1035.0-pr-12", right: "3.1035.0", sign: -1, title: "puts a build with a suffix before its release" },
    { left: "3.1035.0", right: "3.1035.0-pr-12", sign: 1, title: "puts a release after its builds" },
    { left: "3.1035.0-pr-9", right: "3.1035.0-pr-12", sign: -1, title: "compares the numbers in suffixes in order" },
    { left: " 3.1.0 ", right: "3.1.0", sign: 0, title: "ignores surrounding spaces" },
    { left: "3.1035.0+sha.5114f85", right: "3.1035.0", sign: 0, title: "ignores build metadata" },
    { left: "3.1035.0-pr-12+sha.1", right: "3.1035.0-pr-12", sign: 0, title: "ignores build metadata after a suffix" },
  ];

  for (const { left, right, sign, title } of CASES) {
    test(`${title}: ${left} and ${right}`, () => {
      expect(Math.sign(compareModuleVersions(left, right))).toBe(sign);
    });
  }

  for (const version of ["", "latest", "3.x", "3.1.0.0", "v3.1.0", "3.1.0+"]) {
    test(`throws for ${JSON.stringify(version)}`, () => {
      expect(() => compareModuleVersions(version, "3.1.0")).toThrow("is not a module version");
      expect(() => compareModuleVersions("3.1.0", version)).toThrow("is not a module version");
    });
  }
});

test.describe("InstalledModules", () => {
  test("checks a version only when a requirement with a range compares it", () => {
    const installed = new InstalledModules({ "Partner.Module": "1.0.0.0", "VirtoCommerce.Catalog": "3.1034.0" });

    expect(installed.unmetReason({ id: "VirtoCommerce.Catalog", minVersion: "3.1000.0" })).toBeUndefined();
    expect(installed.unmetReason({ id: "Partner.Module" })).toBeUndefined();
    expect(() => installed.unmetReason({ id: "Partner.Module", minVersion: "1.0.0" })).toThrow(
      'Partner.Module: "1.0.0.0" is not a module version',
    );
  });

  test("counts the modules and returns the version of an installed one", () => {
    expect(INSTALLED.count).toBe(2);
    expect(INSTALLED.versionOf("VirtoCommerce.Catalog")).toBe("3.1034.0");
  });

  test("returns undefined for the version of a module that is not installed", () => {
    expect(INSTALLED.versionOf("VirtoCommerce.Orders")).toBeUndefined();
  });

  const REQUIREMENTS = [
    { requirement: { id: "VirtoCommerce.Catalog" }, reason: undefined },
    { requirement: { id: "VirtoCommerce.Catalog", minVersion: "3.1034.0" }, reason: undefined },
    { requirement: { id: "VirtoCommerce.Catalog", beforeVersion: "3.1035.0" }, reason: undefined },
    {
      requirement: { id: "VirtoCommerce.Catalog", minVersion: "3.1000.0", beforeVersion: "3.1035.0" },
      reason: undefined,
    },
    { requirement: { id: "VirtoCommerce.Orders" }, reason: "VirtoCommerce.Orders is not installed" },
    {
      requirement: { id: "VirtoCommerce.Quote", minVersion: "3.1020.0" },
      reason: "VirtoCommerce.Quote 3.1010.0 is older than 3.1020.0",
    },
    {
      requirement: { id: "VirtoCommerce.Catalog", beforeVersion: "3.1034.0" },
      reason: "VirtoCommerce.Catalog 3.1034.0 is not older than 3.1034.0",
    },
  ];

  for (const { requirement, reason } of REQUIREMENTS) {
    test(`checks ${JSON.stringify(requirement)}`, () => {
      expect(INSTALLED.unmetReason(requirement)).toBe(reason);
    });
  }

  test("lists the reason of every unmet requirement in order", () => {
    expect(
      INSTALLED.unmetReasons([
        { id: "VirtoCommerce.Orders" },
        { id: "VirtoCommerce.Catalog" },
        { id: "VirtoCommerce.Quote", minVersion: "3.1020.0" },
      ]),
    ).toEqual(["VirtoCommerce.Orders is not installed", "VirtoCommerce.Quote 3.1010.0 is older than 3.1020.0"]);
  });

  test("returns no reasons when every requirement is met", () => {
    expect(INSTALLED.unmetReasons([{ id: "VirtoCommerce.Catalog" }, { id: "VirtoCommerce.Quote" }])).toEqual([]);
  });

  test("is saved with JSON.stringify and created again from the result", () => {
    const saved = JSON.stringify(INSTALLED);
    const restored = new InstalledModules(JSON.parse(saved));

    expect(JSON.parse(saved)).toEqual({ "VirtoCommerce.Catalog": "3.1034.0", "VirtoCommerce.Quote": "3.1010.0" });
    expect(restored.toJSON()).toEqual(INSTALLED.toJSON());
  });
});

test.describe("InstalledModules.read", () => {
  let server: Server;
  let context: APIRequestContext;
  let client: HttpClient;
  let requested: string[] = [];
  let planned: { readonly status: number; readonly body: unknown } = { status: 200, body: [] };

  test.beforeAll(async () => {
    server = createServer((incoming, outgoing) => {
      requested.push(`${incoming.method} ${incoming.url}`);
      outgoing.writeHead(planned.status, { "content-type": "application/json" }).end(JSON.stringify(planned.body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    context = await request.newContext();
    client = new HttpClient(context, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  });

  test.afterAll(async () => {
    await context.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test.beforeEach(() => {
    requested = [];
  });

  test("reads the installed modules and leaves out the others", async () => {
    planned = {
      status: 200,
      body: [
        { id: "VirtoCommerce.Catalog", version: "3.1034.0", isInstalled: true, title: "Catalog" },
        { id: "VirtoCommerce.Quote", version: "3.1010.0", isInstalled: false },
      ],
    };

    const installed = await InstalledModules.read(client);

    expect(requested).toEqual(["GET /api/platform/modules"]);
    expect(installed.toJSON()).toEqual({ "VirtoCommerce.Catalog": "3.1034.0" });
  });

  test("throws an HttpError when the platform rejects the request", async () => {
    planned = { status: 401, body: {} };

    await expect(InstalledModules.read(client)).rejects.toThrow(HttpError);
  });

  test("throws an HttpError when the response is not a list of modules", async () => {
    planned = { status: 200, body: [{ id: "VirtoCommerce.Catalog" }] };

    await expect(InstalledModules.read(client)).rejects.toThrow("unexpected response body");
  });

  test("reads an installed module whose version is in another form", async () => {
    planned = { status: 200, body: [{ id: "Partner.Module", version: "1.0.0.0", isInstalled: true }] };

    const installed = await InstalledModules.read(client);

    expect(installed.versionOf("Partner.Module")).toBe("1.0.0.0");
  });
});
