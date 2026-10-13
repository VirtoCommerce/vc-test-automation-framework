import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { parseEnv } from "@core/env";
import { Secret } from "@core/secret";
import { loadDataset } from "@dataset/dataset";
import { COLLECTION_NAMES, collectionDir } from "@dataset/manifest";
import { envPlaceholders } from "@dataset/placeholders";

const DATA_DIR = resolve(__dirname, "../../../dataset/data");

const PLACEHOLDERS = {
  STORE_ID: "store-under-test",
  FRONTEND_BASE_URL: "https://frontend.example.com",
  USERS_PASSWORD: "dataset-users-password-1",
  GOOGLE_MAPS_API_KEY: "",
};

function withDataDir(files: Readonly<Record<string, string>>, check: (dataDir: string) => void): void {
  const dataDir = mkdtempSync(join(tmpdir(), "dataset-"));
  try {
    for (const name of COLLECTION_NAMES) {
      mkdirSync(join(dataDir, collectionDir(name)));
    }
    for (const [path, text] of Object.entries(files)) {
      writeFileSync(join(dataDir, path), text);
    }
    check(dataDir);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

test.describe("envPlaceholders", () => {
  test("takes the values from the environment, revealing the secrets", () => {
    const env = parseEnv({
      BACKEND_BASE_URL: "http://localhost:8090",
      FRONTEND_BASE_URL: "https://frontend.example.com",
      STORE_ID: "store-from-env",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "placeholders-admin-password",
      USERS_PASSWORD: "placeholders-users-password",
      GOOGLE_MAPS_API_KEY: "placeholders-maps-key",
    });

    expect(envPlaceholders(env)).toEqual({
      STORE_ID: "store-from-env",
      FRONTEND_BASE_URL: "https://frontend.example.com",
      USERS_PASSWORD: "placeholders-users-password",
      GOOGLE_MAPS_API_KEY: "placeholders-maps-key",
    });
  });
});

test.describe("loadDataset", () => {
  test.describe("the real data", () => {
    const dataset = loadDataset(PLACEHOLDERS);

    test("loads one record per file for every collection", () => {
      for (const name of COLLECTION_NAMES) {
        const files = readdirSync(join(DATA_DIR, collectionDir(name)), { recursive: true }).filter((file) =>
          String(file).endsWith(".json"),
        );
        expect(dataset[name].size, name).toBe(files.length);
      }
    });

    test("fills in every placeholder", () => {
      const text = JSON.stringify(COLLECTION_NAMES.map((name) => dataset[name].all()));

      expect(text).not.toContain("${");
      expect(dataset.stores.all().map((store) => store.id)).toEqual(["store-under-test"]);
      expect(dataset.users.all().every((user) => user.password === PLACEHOLDERS.USERS_PASSWORD)).toBe(true);
    });

    test("freezes the records", () => {
      const product = dataset.products.all()[0];

      expect(Object.isFrozen(product)).toBe(true);
      expect(Object.isFrozen(product?.properties)).toBe(true);
    });

    test("gets records by id", () => {
      expect(dataset.catalogs.get("catalog-acme-electronics").name).toBe("ACME Catalog Electronics");
    });

    test("types platform settings and organization memberships with their platform types", () => {
      const languages = dataset.platformSettings.get("platform-setting-languages");
      const memberships = dataset.organizationMemberships.filter(
        (membership) => membership.userId === "user-acme-store-employee-1",
      );

      expect(languages.name).toBe("VirtoCommerce.Core.General.Languages");
      expect(memberships.map((membership) => membership.organizationId)).toEqual(["organization-acme-store"]);
    });
  });

  test("reads files in path order", () => {
    withDataDir(
      {
        "currencies/b.json": '{"code":"EUR"}',
        "currencies/a.json": '{"code":"USD"}',
      },
      (dataDir) => {
        expect(loadDataset(PLACEHOLDERS, dataDir).currencies.all()).toEqual([{ code: "USD" }, { code: "EUR" }]);
      },
    );
  });

  test("escapes placeholder values inside JSON strings", () => {
    withDataDir({ "stores/store.json": '{"id":"${ENV:STORE_ID}"}' }, (dataDir) => {
      const dataset = loadDataset({ ...PLACEHOLDERS, STORE_ID: 'store "quoted" \\' }, dataDir);

      expect(dataset.stores.all()).toEqual([{ id: 'store "quoted" \\' }]);
    });
  });

  test("names the file whose placeholder cannot be filled in", () => {
    withDataDir({ "stores/store.json": '{"id":"${ENV:STORE_CODE}"}' }, (dataDir) => {
      expect(() => loadDataset(PLACEHOLDERS, dataDir)).toThrow(
        /^Dataset file stores[\\/]store\.json: \$\{ENV:STORE_CODE\} has no value$/,
      );
    });
  });

  test("names the file that is not valid JSON and masks known secrets in the quoted text", () => {
    const password = new Secret("pw-7f3a");
    withDataDir({ "users/user.json": `["${password.reveal()}", x]` }, (dataDir) => {
      const error = (() => {
        try {
          loadDataset(PLACEHOLDERS, dataDir);
        } catch (thrown) {
          return thrown;
        }
        throw new Error("expected loadDataset to throw");
      })();

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /^Dataset file users[\\/]user\.json: Unexpected token 'x', "\["\[SECRET\]", x\]" is not valid JSON$/,
      );
      expect((error as Error).cause).toBeUndefined();
    });
  });
});
