import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

import { MASKED, Secret } from "@/core";
import { envPlaceholder, loadDataset, recordPlaceholder } from "@/dataset";

const MODULE = { id: "VirtoCommerce.Catalog" };
const MANIFEST = {
  catalogs: { module: MODULE, method: "POST", path: "/api/catalog/catalogs", send: "each" },
  productInventories: { module: MODULE, method: "PUT", path: "/api/inventory/products", send: "all" },
} as const;

let dataDir: string;

test.beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "dataset-"));
});

test.afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function writeData(path: string, content: string): void {
  const file = join(dataDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test.describe("placeholder helpers", () => {
  test("return the placeholders of a value and of a record field", () => {
    expect(envPlaceholder("STORE_ID")).toBe("$" + "{ENV:STORE_ID}");
    expect(recordPlaceholder("code")).toBe("$" + "{RECORD:code}");
  });

  for (const name of ["", "a}b"]) {
    test(`throw for ${JSON.stringify(name)}`, () => {
      expect(() => envPlaceholder(name)).toThrow(`"${name}" cannot be used in a placeholder`);
      expect(() => recordPlaceholder(name)).toThrow(`"${name}" cannot be used in a placeholder`);
    });
  }
});

test.describe("loadDataset", () => {
  test("reads the JSON files of each collection and its subdirectories in path order", () => {
    writeData("catalogs/b.json", '{ "id": "catalog-b" }');
    writeData("catalogs/a/c.json", '{ "id": "catalog-a-c" }');
    writeData("catalogs/a1.json", '{ "id": "catalog-a1" }');
    writeData("catalogs/a.json", '{ "id": "catalog-a" }');
    writeData("catalogs/notes.txt", "not a record");
    writeData("product-inventories/1.json", '{ "productId": "product-1" }');

    const dataset = loadDataset({ manifest: MANIFEST, dataDir });

    expect(dataset.catalogs.all()).toEqual([
      { id: "catalog-a" },
      { id: "catalog-a-c" },
      { id: "catalog-a1" },
      { id: "catalog-b" },
    ]);
    expect(dataset.productInventories.all()).toEqual([{ productId: "product-1" }]);
  });

  test("returns an empty collection for a collection without a directory", () => {
    const dataset = loadDataset({ manifest: MANIFEST, dataDir });

    expect(dataset.catalogs.count).toBe(0);
  });

  test("freezes the records and their nested values", () => {
    writeData("catalogs/a.json", '{ "id": "catalog-a", "languages": [{ "code": "en-US" }] }');

    const [catalog] = loadDataset({ manifest: MANIFEST, dataDir }).catalogs.all();

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog?.["languages"])).toBe(true);
  });

  test("fills the placeholders as JSON string content and reveals secrets", () => {
    writeData(
      "catalogs/a.json",
      `{ "id": "${envPlaceholder("PREFIX")}-a", "password": "${envPlaceholder("PASSWORD")}" }`,
    );

    const dataset = loadDataset({
      manifest: MANIFEST,
      dataDir,
      placeholders: { PREFIX: 'quoted "store"', PASSWORD: Secret.of("dataset-password-1") },
    });

    expect(dataset.catalogs.all()).toEqual([{ id: 'quoted "store"-a', password: "dataset-password-1" }]);
  });

  test("throws for a placeholder without a value and names the file", () => {
    writeData("catalogs/a.json", `{ "id": "${envPlaceholder("PREFIX")}-a" }`);

    expect(() => loadDataset({ manifest: MANIFEST, dataDir })).toThrow(
      `The dataset file catalogs/a.json: ${envPlaceholder("PREFIX")} has no value`,
    );
  });

  test("throws for a file that is not valid JSON, names the file and masks secrets", () => {
    writeData("catalogs/a.json", envPlaceholder("PASSWORD"));

    expect(() =>
      loadDataset({ manifest: MANIFEST, dataDir, placeholders: { PASSWORD: Secret.of("dataset-password-2") } }),
    ).toThrow(`The dataset file catalogs/a.json: Unexpected token 'd', "${MASKED}" is not valid JSON`);
  });

  for (const content of ['"catalog"', "5", "null", '[{ "id": "catalog-a" }]']) {
    test(`throws for a file that holds ${content} instead of an object`, () => {
      writeData("catalogs/a.json", content);

      expect(() => loadDataset({ manifest: MANIFEST, dataDir })).toThrow(
        "The dataset file catalogs/a.json: the file does not hold a JSON object",
      );
    });
  }
});
