import { expect, test } from "@playwright/test";

import { compareModuleVersions, unmetReason, unmetReasons } from "@core/modules";

const PAGE_BUILDER = "VirtoCommerce.PageBuilderModule";

test.describe("compareModuleVersions", () => {
  for (const [older, newer] of [
    ["3.1012.1", "3.1034.0"],
    ["3.1034.0", "3.1034.1"],
    ["3.1034", "3.10340"],
    ["3.999.0", "3.1000.0"],
    ["3.1035.0-pr-12", "3.1035.0"],
    ["3.1035.0-pr-9", "3.1035.0-pr-12"],
    ["3", "3.0.1"],
  ] as const) {
    test(`orders ${older} before ${newer}`, () => {
      expect(compareModuleVersions(older, newer)).toBeLessThan(0);
      expect(compareModuleVersions(newer, older)).toBeGreaterThan(0);
    });
  }

  test("treats missing parts as zero", () => {
    expect(compareModuleVersions("3.1034", "3.1034.0")).toBe(0);
  });

  test("throws for a value that is not a version", () => {
    expect(() => compareModuleVersions("latest", "3.1034.0")).toThrow('"latest" is not a module version');
  });
});

test.describe("unmetReason", () => {
  const installed = new Map([[PAGE_BUILDER, "3.1034.0"]]);

  for (const { title, requirement, expected } of [
    { title: "any installed version", requirement: { id: PAGE_BUILDER }, expected: undefined },
    {
      title: "the minimum version itself",
      requirement: { id: PAGE_BUILDER, minVersion: "3.1034.0" },
      expected: undefined,
    },
    {
      title: "a version below the exclusive upper bound",
      requirement: { id: PAGE_BUILDER, minVersion: "3.1012.0", beforeVersion: "3.1035.0" },
      expected: undefined,
    },
    {
      title: "a module that is not installed",
      requirement: { id: "VirtoCommerce.XPickup" },
      expected: "VirtoCommerce.XPickup is not installed",
    },
    {
      title: "a version older than the minimum",
      requirement: { id: PAGE_BUILDER, minVersion: "3.1040.0" },
      expected: `${PAGE_BUILDER} 3.1034.0 is older than 3.1040.0`,
    },
    {
      title: "the exclusive upper bound itself",
      requirement: { id: PAGE_BUILDER, beforeVersion: "3.1034.0" },
      expected: `${PAGE_BUILDER} 3.1034.0 is not older than 3.1034.0`,
    },
  ]) {
    test(`reports ${title} as ${expected === undefined ? "met" : "unmet"}`, () => {
      expect(unmetReason(requirement, installed)).toBe(expected);
    });
  }
});

test.describe("unmetReasons", () => {
  test("lists the reasons of the unmet requirements in the given order", () => {
    const installed = new Map([
      ["VirtoCommerce.Core", "3.1000.0"],
      [PAGE_BUILDER, "3.1012.1"],
    ]);

    expect(
      unmetReasons(
        [{ id: "VirtoCommerce.Quote" }, { id: "VirtoCommerce.Core" }, { id: PAGE_BUILDER, minVersion: "3.1034.0" }],
        installed,
      ),
    ).toEqual(["VirtoCommerce.Quote is not installed", `${PAGE_BUILDER} 3.1012.1 is older than 3.1034.0`]);
  });
});
