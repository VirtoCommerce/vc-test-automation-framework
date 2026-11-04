import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { array, object, string } from "zod";

import { unmetReason } from "@core/modules";
import { parseOrThrow } from "@core/validation";
import { MODULES } from "@dataset/modules";

const BACKEND_PACKAGES = "backend-packages.json";
const BackendPackagesSchema = object({
  Sources: array(object({ Modules: array(object({ Id: string(), Version: string() })).default([]) })),
});

const edgeModules: ReadonlyMap<string, string> = new Map(
  parseOrThrow(BackendPackagesSchema, JSON.parse(readFileSync(BACKEND_PACKAGES, "utf8")), BACKEND_PACKAGES)
    .Sources.flatMap(({ Modules }) => Modules)
    .map(({ Id, Version }) => [Id, Version]),
);

test.describe("MODULES", () => {
  test(`is met by the module versions CI deploys (${BACKEND_PACKAGES})`, () => {
    const unmet = Object.entries(MODULES).flatMap(([key, requirement]) => {
      const reason = unmetReason(requirement, edgeModules);
      return reason === undefined ? [] : [`${key}: ${reason}`];
    });

    expect(unmet).toEqual([]);
  });
});
