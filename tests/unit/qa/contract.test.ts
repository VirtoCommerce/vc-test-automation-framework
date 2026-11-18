import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { checkContract } from "../../../qa/contract.mts";

const FILLED = readFileSync("tests/unit/qa/fixtures/contract-example.md", "utf8");
const TEMPLATE = readFileSync(".claude/skills/plan-implementation/contract-template.md", "utf8");
const ROLES = ["store employee", "store administrator"];

function without(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  const next = markdown.indexOf("\n## ", start + 1);
  return markdown.slice(0, start) + (next === -1 ? "" : markdown.slice(next + 1));
}

test.describe("contract check", () => {
  test("accepts the template filled in", () => {
    expect(checkContract(FILLED, ROLES)).toEqual([]);
    expect(checkContract(FILLED)).toEqual([]);
  });

  test("the template itself passes the check, so it cannot drift from it", () => {
    expect(checkContract(TEMPLATE)).toEqual([]);
  });

  test("names each missing section", () => {
    const missing = ["Scope", "Out of scope", "Stand needs", "Building blocks", "Known issues", "Verification"];
    for (const heading of missing) {
      expect(checkContract(without(FILLED, heading))).toEqual([`contract: ## ${heading} is missing`]);
    }
    expect(checkContract("# Contract\n")).toHaveLength(8);
  });

  test("rejects a source that is not ticket, doc, area or gap", () => {
    const bad = FILLED.replace("ticket: PRJ-42", "idea: coupons");
    expect(checkContract(bad)).toEqual(["contract: ## Source must start with ticket:, doc:, area: or gap:"]);
  });

  test("accepts an area source with no ticket", () => {
    const area = FILLED.replace("ticket: PRJ-42", "area: cart coupons");
    expect(checkContract(area, ROLES)).toEqual([]);
  });

  test("rejects a cases table without the Technique column", () => {
    const bad = FILLED.replaceAll("| Technique ", "| Approach ");
    expect(checkContract(bad)).toEqual(["contract: ## Cases table has no Technique column"]);
  });

  test("rejects a cases table with no rows", () => {
    const head = FILLED.indexOf("| C-01");
    const tail = FILLED.indexOf("\n## Observed only");
    const bad = FILLED.slice(0, head) + FILLED.slice(tail + 1);
    expect(checkContract(bad)).toContain("contract: ## Cases table has no case rows");
  });

  test("a data role not in the facts fails", () => {
    const bad = FILLED.replace("| store employee |", "| warehouse clerk |");
    expect(checkContract(bad, ROLES)).toEqual([
      'contract: case "C-05 coupon shown in the cart page" data role "warehouse clerk" is not in the facts roles',
    ]);
    expect(checkContract(bad)).toEqual([]);
  });

  test("an oracle without its source fails", () => {
    const bad = FILLED.replace("| ticket: AC-1 the total drops by the coupon value |", "| the total drops |");
    expect(checkContract(bad)).toEqual([
      'contract: case "C-01 valid coupon lowers the total" oracle must start with ticket:, doc:, schema: or observed:',
    ]);
  });

  test("an observed-only case missing from the Observed only section fails", () => {
    const bad = FILLED.replace("- C-05 coupon shown in the cart page: characterization", "- nothing");
    expect(checkContract(bad)).toEqual([
      'contract: ## Observed only does not list case "C-05 coupon shown in the cart page"',
    ]);
    expect(checkContract(without(FILLED, "Observed only"))).toEqual(["contract: ## Observed only is missing"]);
  });

  test("an observed-only case needs a confirmation or a characterization mark", () => {
    const confirmed = FILLED.replace(": characterization", ": confirmed by Dana Lee");
    expect(checkContract(confirmed)).toEqual([]);
    const bare = FILLED.replace(": characterization", ": probably fine");
    expect(checkContract(bare)).toEqual([
      'contract: ## Observed only case "C-05 coupon shown in the cart page" must be marked confirmed by <who> or characterization',
    ]);
  });

  test("a case with an observed oracle and a documented one is not observed-only", () => {
    const mixed = FILLED.replace(
      "observed: the cart page lists the applied code",
      "observed: the cart page lists the code; doc: the cart page",
    );
    expect(checkContract(without(mixed, "Observed only"))).toEqual([]);
  });

  test("an amendment without approval fails", () => {
    const amended = `${FILLED}\n## Amendments\n\n### A-1 drop C-03\n\nThe minimum value is not configurable on the stand.\n`;
    expect(checkContract(amended)).toEqual([
      'contract: ## Amendments entry "A-1 drop C-03" has no Approved: <who>, <date> line',
    ]);
    const approved = `${amended}\nApproved: Dana Lee, 2026-11-19\n`;
    expect(checkContract(approved)).toEqual([]);
  });

  test("an approval needs a person and an ISO date", () => {
    const base = `${FILLED}\n## Amendments\n\n### A-1 drop C-03\n\nReason.\n`;
    expect(checkContract(`${base}\nApproved: Dana Lee, yesterday\n`)).toHaveLength(1);
    expect(checkContract(`${base}\nApproved: , 2026-11-19\n`)).toHaveLength(1);
  });

  test("an amendments section with text but no entry fails", () => {
    expect(checkContract(`${FILLED}\n## Amendments\n\nPlease drop C-03.\n`)).toEqual([
      "contract: ## Amendments has text outside a ### entry",
    ]);
  });

  test("an empty amendments section is fine", () => {
    expect(checkContract(`${FILLED}\n## Amendments\n`)).toEqual([]);
  });
});
