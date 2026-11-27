import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { dependencySpecs, exactVersion, suiteOverrides, withOverrides } from "../../../bin/lib/dependencies.mjs";

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), "utf8")) as Record<
    string,
    unknown
  >;
}

test.describe("init dependency pins", () => {
  test("exactVersion strips a leading caret or tilde and leaves anything else", () => {
    expect(exactVersion("^2.6.8")).toBe("2.6.8");
    expect(exactVersion("~1.2.3")).toBe("1.2.3");
    expect(exactVersion("latest")).toBe("latest");
    expect(exactVersion("1.0.0")).toBe("1.0.0");
  });

  test("exactVersion leaves a range that is not one plain version unchanged", () => {
    expect(exactVersion("^16.0.0 || ^17.0.0")).toBe("^16.0.0 || ^17.0.0");
    expect(exactVersion(">=1.2.3")).toBe(">=1.2.3");
    expect(exactVersion("^1.2")).toBe("^1.2");
  });

  test("dependencySpecs pins each name to the dev version, then the peer version, else latest", () => {
    const own = {
      peerDependencies: { a: "^1.0.0", b: "^4.0.7", d: "^16.0.0 || ^17.0.0" },
      devDependencies: { b: "^4.6.7", e: "2.0.0" },
    };

    expect(dependencySpecs(own, ["a", "b", "c", "d", "e"])).toEqual([
      'a@"1.0.0"',
      'b@"4.6.7"',
      'c@"latest"',
      'd@"^16.0.0 || ^17.0.0"',
      'e@"2.0.0"',
    ]);
  });

  test("suiteOverrides carries only glob and minimatch", () => {
    expect(suiteOverrides({ overrides: { glob: "14.0.4", minimatch: "11.0.5", other: "1" } })).toEqual({
      glob: "14.0.4",
      minimatch: "11.0.5",
    });
    expect(suiteOverrides({})).toEqual({});
  });

  test("withOverrides adds no overrides entry when there is nothing to add", () => {
    expect(withOverrides({ name: "x" }, {})).toEqual({ name: "x" });
    expect(withOverrides({ name: "x", overrides: { glob: "9.0.0" } }, {})).toEqual({
      name: "x",
      overrides: { glob: "9.0.0" },
    });
  });

  test("withOverrides adds the missing overrides and keeps the ones the manifest already has", () => {
    const merged = withOverrides({ name: "x", overrides: { glob: "9.0.0" } }, { glob: "14.0.4", minimatch: "11.0.5" });

    expect(merged.overrides).toEqual({ glob: "9.0.0", minimatch: "11.0.5" });
    expect(merged.name).toBe("x");
  });

  test("the package pins Biome exactly, to the version its preset schema names", () => {
    const devDependencies = readJson("package.json")["devDependencies"] as Record<string, string>;
    const schema = readJson(".biome/preset.json")["$schema"] as string;

    expect(devDependencies["@biomejs/biome"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(schema).toContain(`/schemas/${devDependencies["@biomejs/biome"]}/`);
  });
});
