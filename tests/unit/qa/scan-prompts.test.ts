import { expect, test } from "@playwright/test";

import { readProjectFacts } from "../../../qa/project-facts.mts";
import { scanPrompts } from "../../../qa/scan-prompts.mts";

test("the shipped prompts are clean", () => {
  expect(scanPrompts(process.cwd(), readProjectFacts())).toEqual([]);
});
