import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { parseProjectFacts } from "../../../.claude/checks/project-facts.mts";
import { keyPatternProblem, trackerKind, trackerKindProblem } from "../../../bin/lib/tracker-key.mjs";

const TEMPLATE_FACTS = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "templates", "suite", ".qa", "project.json"), "utf8"),
);

const CASES: [kind: string, keyPattern: string, accepted: boolean][] = [
  ["jira", "^ABC-\\d+$", true],
  ["jira", "^SHOP-\\d+$", true],
  ["jira", "^(SHOP|QA)-\\d+$", true],
  ["jira", "^[A-Z][A-Z0-9]+-\\d+$", true],
  ["jira", "^ABC1-\\d{1,6}$", true],
  ["jira", "SHOP", true],
  ["jira", "^SHOP$", false],
  ["jira", "^\\d+$", false],
  ["jira", "^ABC-d+$", false],
  ["jira", "^abc-\\d+$", false],
  ["jira", "(", false],
  ["azure-boards", "^\\d+$", true],
  ["azure-boards", "^AB#\\d+$", true],
  ["azure-boards", "^#?\\d{1,7}$", true],
  ["azure-boards", "SHOP", false],
  ["azure-boards", "^SHOP-\\d+$", false],
  ["azure-boards", "^AB#d+$", false],
  ["azure-boards", "^\\d{8,}$", false],
  ["youtrack", "^YT-\\d+$", true],
  ["youtrack", "anything", true],
  ["youtrack", "^YT-w+$", false],
];

function factsAccept(kind: string, keyPattern: string): boolean {
  try {
    parseProjectFacts({ ...TEMPLATE_FACTS, tracker: { kind, keyPattern, routes: ["paste"] } });
    return true;
  } catch {
    return false;
  }
}

test.describe("keyPatternProblem", () => {
  for (const [kind, keyPattern, accepted] of CASES) {
    test(`agrees with the facts check on ${kind} ${keyPattern}`, () => {
      expect(factsAccept(kind, keyPattern)).toBe(accepted);
      expect(keyPatternProblem(kind, keyPattern) === undefined).toBe(accepted);
    });
  }
});

test.describe("trackerKindProblem", () => {
  test("refuses several trackers and a blank kind, and accepts one tracker of any name", () => {
    for (const kind of ["jira, azure-boards", "jira/azure-boards", "jira and azure-boards", "jira azure-boards"]) {
      expect(trackerKindProblem(kind)).toBe("one tracker only for now (enter the main one)");
    }
    expect(trackerKindProblem("  ")).toBe("must not be blank");
    for (const kind of ["jira", "azure-boards", "Azure Boards", "YouTrack", "GitHub Issues"]) {
      expect(trackerKindProblem(kind)).toBeUndefined();
    }
  });

  test("writes a known tracker in the facts' spelling and keeps any other name as typed", () => {
    expect(trackerKind(" Jira ")).toBe("jira");
    expect(trackerKind("Azure Boards")).toBe("azure-boards");
    expect(trackerKind("YouTrack")).toBe("YouTrack");
  });
});
