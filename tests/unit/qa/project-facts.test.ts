import { expect, test } from "@playwright/test";

import { DEFAULT_CLIENT_ROUTES, parseProjectFacts, readProjectFacts } from "../../../qa/project-facts.mts";

const VALID = {
  tracker: { kind: "jira", keyPattern: "^PRJ-d+$", routes: ["command", "paste"] },
  docSources: [{ name: "docs", route: "api", where: "https://docs.example.com" }],
  commands: { typecheck: "npm run typecheck", lint: "npm run check", test: { unit: "npm run test:unit" } },
  critical: ["checkout"],
  knowledgeDir: ".qa/kb",
  roles: { admin: "admin@example.com" },
  coverageWeights: { risk: 1, callFrequency: 1, runFrequency: 1, stability: 1, cost: 1 },
  flakyRunSeries: 5,
  autonomy: { "*": "propose" },
  healerPaths: ["pages/", "dataset/"],
};

function withRoutes(routes: unknown): unknown {
  return { ...VALID, tracker: { ...VALID.tracker, routes } };
}

test.describe("project facts", () => {
  test("parses our project.json", () => {
    const facts = readProjectFacts(".qa/project.json");

    expect(facts.roles["store administrator"]).toBe("acme_store_administrator@acme.com");
    expect(facts.tracker.routes).toEqual(["command", "cli", "api", "mcp", "paste"]);
    expect(facts.healerPaths).toEqual(["pages/", "dataset/"]);
  });

  test("parses a minimal valid file", () => {
    const facts = parseProjectFacts(VALID);

    expect(facts.tracker.kind).toBe("jira");
    expect(facts.autonomy["*"]).toBe("propose");
  });

  test("a file without tracker routes reads pasted text only", () => {
    const tracker = { kind: VALID.tracker.kind, keyPattern: VALID.tracker.keyPattern };

    expect(DEFAULT_CLIENT_ROUTES).toEqual(["paste"]);
    expect(parseProjectFacts({ ...VALID, tracker }).tracker.routes).toEqual(["paste"]);
  });

  test("rejects a tracker with an empty route list", () => {
    expect(() => parseProjectFacts(withRoutes([]))).toThrow("project.json: tracker.routes is empty");
  });

  test("rejects a file missing commands.typecheck", () => {
    expect(() => parseProjectFacts({ ...VALID, commands: { lint: "x", test: {} } })).toThrow(
      "project.json: commands.typecheck is missing",
    );
  });

  test("rejects an unknown route", () => {
    expect(() => parseProjectFacts(withRoutes(["email"]))).toThrow("project.json: tracker.routes[0] is not a route");
  });

  test("rejects a key that is not a valid regular expression", () => {
    expect(() => parseProjectFacts({ ...VALID, tracker: { ...VALID.tracker, keyPattern: "([" } })).toThrow(
      "project.json: tracker.keyPattern is not a valid regular expression",
    );
  });

  test("rejects a flaky run series below 2", () => {
    expect(() => parseProjectFacts({ ...VALID, flakyRunSeries: 1 })).toThrow(
      "project.json: flakyRunSeries must be an integer of at least 2",
    );
  });

  test("rejects an autonomy value that is neither apply nor propose", () => {
    expect(() => parseProjectFacts({ ...VALID, autonomy: { "*": "yolo" } })).toThrow(
      'project.json: autonomy["*"] must be "apply" or "propose"',
    );
  });

  test("rejects an autonomy map without a default", () => {
    expect(() => parseProjectFacts({ ...VALID, autonomy: { checkout: "propose" } })).toThrow(
      'project.json: autonomy["*"] is missing',
    );
  });

  test("rejects a file without healerPaths", () => {
    const { healerPaths: _ignored, ...rest } = VALID;

    expect(() => parseProjectFacts(rest)).toThrow("project.json: healerPaths is missing");
  });

  test("rejects a healer path that is absolute or leaves the repository", () => {
    for (const path of ["/etc", "../outside/", "pages/../../x", ""]) {
      expect(() => parseProjectFacts({ ...VALID, healerPaths: [path] }), path).toThrow("project.json: healerPaths[0]");
    }
  });

  test("rejects the repository root, rooted, drive and UNC forms, git, qa, tooling and short-name segments", () => {
    for (const path of [
      ".",
      "./",
      ".\\",
      ".git",
      ".git/",
      ".GIT/hooks",
      ".gitattributes",
      "pages/.git/x",
      "pages/.gitignore",
      ".qa/",
      ".QA/runs",
      "pages/.qa",
      "qa",
      "qa/",
      "QA",
      "pages/qa",
      "node_modules",
      "pages/node_modules/",
      ".claude",
      ".claude/hooks",
      "pages/.claude",
      "\\Users\\x",
      "\\\\server\\x",
      "//server/x",
      "C:/x",
      "c:pages",
      "GIT~1/config",
      "pages/PAGES~2",
      "pages\\x",
      "pages//x",
      "pages/./x",
      "pages/..",
      "pages x/",
      "pages/*",
      "-pages",
    ]) {
      expect(() => parseProjectFacts({ ...VALID, healerPaths: [path] }), path).toThrow("project.json: healerPaths[0]");
    }
  });

  test("accepts a plain relative directory, with or without its trailing slash", () => {
    for (const path of ["pages/", "dataset", "tests/", "src/page-objects/v1.2/", "a_b-c"]) {
      expect(parseProjectFacts({ ...VALID, healerPaths: [path] }).healerPaths, path).toEqual([path]);
    }
  });

  test("a healer path list may be empty", () => {
    expect(parseProjectFacts({ ...VALID, healerPaths: [] }).healerPaths).toEqual([]);
  });

  test("rejects a missing file with its path", () => {
    expect(() => readProjectFacts(".qa/does-not-exist.json")).toThrow(
      "project.json: .qa/does-not-exist.json cannot be read",
    );
  });
});
