import type { SeedCounts, SeedEvent } from "@virtocommerce/test-automation-framework/dataset";

import { styleText } from "node:util";

import { test } from "@playwright/test";
import { TokenClient, TokenManager } from "@virtocommerce/test-automation-framework/auth";
import { parseCollectionNames, seedDataset } from "@virtocommerce/test-automation-framework/dataset";
import { HttpClient } from "@virtocommerce/test-automation-framework/http";
import { InstalledModules } from "@virtocommerce/test-automation-framework/modules";

import { seedFinishers } from "../dataset/finishers.ts";
import { dataset, MANIFEST, PLACEHOLDERS } from "../dataset/index.ts";
import { env } from "../env.ts";

type Color = "green" | "yellow" | "red";
type Paint = (color: Color, text: string) => string;

const SEED_TIMEOUT_MS = 15 * 60_000;

test.describe.configure({ timeout: SEED_TIMEOUT_MS });

test("seed the dataset", async ({ playwright }) => {
  const context = await playwright.request.newContext({
    ignoreHTTPSErrors: !env.VERIFY_SSL,
    timeout: env.REQUEST_TIMEOUT_MS,
  });
  const anonymous = new HttpClient(context, env.BACKEND_BASE_URL);
  const tokenClient = new TokenClient(anonymous);
  const tokens = new TokenManager(tokenClient);
  const lines: string[] = [];
  function log(message: string): void {
    lines.push(message);
    process.stdout.write(`seed: ${message}\n`);
  }
  function report(event: SeedEvent): void {
    lines.push(lineOf(event, plain));
    process.stdout.write(`seed: ${lineOf(event, styleText)}\n`);
  }

  try {
    const admin = await tokens.signIn(anonymous, { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
    const only = parseCollectionNames(MANIFEST, env.SEED_ONLY);
    await seedDataset({
      http: admin,
      manifest: MANIFEST,
      dataset,
      installed: await test.step("read the installed modules", () => InstalledModules.read(admin)),
      only,
      placeholders: PLACEHOLDERS,
      finishers: seedFinishers(admin, tokenClient, log),
      onEvent: report,
    });
  } finally {
    await test.info().attach("seed log", { body: lines.join("\n"), contentType: "text/plain" });
    await tokens.signOutAll();
    await context.dispose();
  }
});

function lineOf(event: SeedEvent, paint: Paint): string {
  switch (event.kind) {
    case "started":
      return `seeding ${event.collections.length} collections: ${event.collections.join(", ")}`;
    case "skipped":
      return `${event.name}: ${event.reason}, ${paint("yellow", "skipped")}`;
    case "seeded":
      return `${event.name}: ${countsOf(event.counts, paint)} in ${secondsOf(event.seconds)}`;
    case "failed":
      if (event.step === "manifest") {
        return `manifest: ${paint("red", "failed")} after ${secondsOf(event.seconds)}`;
      }
      if (event.step === "finisher") {
        return `${event.name} finisher: ${paint("red", "failed")} after ${secondsOf(event.seconds)}`;
      }
      return (
        `${event.name}: ${countsOf(event.counts, paint)}, ` +
        `${paint("red", event.subject === undefined ? "failed" : `failed at ${event.subject}`)} after ${secondsOf(event.seconds)}`
      );
    case "finished":
      return (
        `${counted(event.seeded, "seeded", "green", paint)}, ${counted(event.skipped, "skipped", "yellow", paint)}, ` +
        `${counted(event.failed, "failed", "red", paint)}: ${event.sent} sent, ${event.existing} already stored ` +
        `in ${secondsOf(event.seconds)}`
      );
  }
}

function countsOf(counts: SeedCounts, paint: Paint): string {
  return `${counts.records} records, ${counts.existing} already stored, ${counted(counts.sent, "sent", "green", paint)}`;
}

function counted(count: number, what: string, color: Color, paint: Paint): string {
  const text = `${count} ${what}`;
  return count === 0 ? text : paint(color, text);
}

function secondsOf(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function plain(_color: Color, text: string): string {
  return text;
}
