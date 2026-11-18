import type { TicketCard } from "../../../qa/ticket-card.mts";

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { parseProjectFacts } from "../../../qa/project-facts.mts";
import { parseTicketCard, writeTicketCard } from "../../../qa/ticket-card.mts";

const FACTS = parseProjectFacts({
  tracker: { kind: "jira", keyPattern: "^PRJ-[0-9]+$", routes: ["cli", "paste"] },
  docSources: [],
  commands: { typecheck: "npm run typecheck", lint: "npm run check", test: { unit: "npm run test:unit" } },
  critical: [],
  knowledgeDir: ".qa/kb",
  roles: {},
  coverageWeights: { risk: 1, callFrequency: 1, runFrequency: 1, stability: 1, cost: 1 },
  flakyRunSeries: 5,
  autonomy: { "*": "propose" },
  healerPaths: ["pages/", "dataset/"],
});

const CARD = {
  key: "PRJ-12",
  title: "Order total ignores the coupon",
  type: "Bug",
  status: "In Test",
  description: "The total does not change after a coupon is applied.",
  acceptanceCriteria: ["The total drops by the coupon value"],
  links: [{ key: "PRJ-3", relation: "blocks" }],
  url: "https://tracker.example.com/browse/PRJ-12",
  route: "cli",
  capturedAt: "2026-11-18T10:00:00.000Z",
};

test.describe("ticket card", () => {
  test("accepts a full card", () => {
    expect(parseTicketCard(CARD, FACTS)).toEqual(CARD);
  });

  test("rejects a key that does not match keyPattern", () => {
    expect(() => parseTicketCard({ ...CARD, key: "OTHER-1" }, FACTS)).toThrow(
      "ticket card: key does not match tracker.keyPattern",
    );
  });

  test("a card without acceptance criteria says so", () => {
    expect(() => parseTicketCard({ ...CARD, acceptanceCriteria: [] }, FACTS)).toThrow(
      'ticket card: acceptanceCriteria is empty, use "none found"',
    );
    expect(parseTicketCard({ ...CARD, acceptanceCriteria: "none found" }, FACTS).acceptanceCriteria).toBe("none found");
    expect(() => parseTicketCard({ ...CARD, acceptanceCriteria: undefined }, FACTS)).toThrow(
      "ticket card: acceptanceCriteria is missing",
    );
  });

  test("rejects a route the facts do not allow", () => {
    expect(() => parseTicketCard({ ...CARD, route: "mcp" }, FACTS)).toThrow(
      "ticket card: route is not allowed by tracker.routes",
    );
  });

  test("rejects a missing field and an unknown route", () => {
    expect(() => parseTicketCard({ ...CARD, title: undefined }, FACTS)).toThrow("ticket card: title is missing");
    expect(() => parseTicketCard({ ...CARD, route: "email" }, FACTS)).toThrow("ticket card: route is not a route");
  });

  test("rejects a link without a relation and a capture time that is not a date", () => {
    expect(() => parseTicketCard({ ...CARD, links: [{ key: "PRJ-3" }] }, FACTS)).toThrow(
      "ticket card: links[0].relation is missing",
    );
    expect(() => parseTicketCard({ ...CARD, capturedAt: "yesterday" }, FACTS)).toThrow(
      "ticket card: capturedAt is not an ISO date",
    );
  });

  test("writes the card to <dir>/tickets/<key>.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "ticket-card-"));
    try {
      const path = writeTicketCard(parseTicketCard(CARD, FACTS), dir);

      expect(path).toBe(join(dir, "tickets", "PRJ-12.json"));
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(CARD);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses to write a key that would leave the directory", () => {
    const loose = { ...FACTS, tracker: { ...FACTS.tracker, keyPattern: ".*" } };
    const dir = mkdtempSync(join(tmpdir(), "ticket-card-"));
    const handBuilt: TicketCard = { ...parseTicketCard(CARD, FACTS), key: "../x" };

    try {
      expect(() => parseTicketCard({ ...CARD, key: "../x" }, loose)).toThrow(
        "ticket card: key is not a safe file name",
      );
      expect(() => writeTicketCard(handBuilt, dir)).toThrow("ticket card: key is not a safe file name");
      expect(existsSync(join(dir, "tickets"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
