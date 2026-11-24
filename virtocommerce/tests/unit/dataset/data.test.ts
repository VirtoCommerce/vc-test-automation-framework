import type { DatasetRecord } from "@virtocommerce/test-automation-framework/dataset";

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { loadDataset } from "@virtocommerce/test-automation-framework/dataset";

import { MANIFEST } from "../../../dataset/manifest.ts";

type CollectionName = keyof typeof MANIFEST;

interface EmbeddedReference {
  readonly collection: CollectionName;
  readonly sameFields: readonly string[];
}

interface Reference {
  readonly field: string;
  readonly id: string;
}

const DATA_DIR = fileURLToPath(new URL("../../../dataset/data", import.meta.url));

const COLLECTION_NAMES = Object.keys(MANIFEST) as CollectionName[];

const NOT_DATASET_REFERENCES = new Set(["regionId", "vendorId", "moduleId", "shoppingCartId"]);

const EMBEDDED_REFERENCES: Partial<Record<CollectionName, Readonly<Record<string, EmbeddedReference>>>> = {
  users: { roles: { collection: "roles", sameFields: ["name"] } },
  prices: { product: { collection: "products", sameFields: ["name"] } },
  products: { properties: { collection: "catalogProperties", sameFields: ["name"] } },
  notifications: { tenantIdentity: { collection: "stores", sameFields: [] } },
};

const dataset = loadDataset({
  manifest: MANIFEST,
  dataDir: DATA_DIR,
  placeholders: {
    FRONTEND_BASE_URL: "https://frontend.example.com",
    USERS_PASSWORD: "data-test-password",
    GOOGLE_MAPS_API_KEY: "",
  },
});

function collectionDir(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function recordsOf(name: CollectionName): readonly DatasetRecord[] {
  return dataset[name].all() as readonly DatasetRecord[];
}

function keyFields(name: CollectionName): readonly string[] {
  const { key } = MANIFEST[name] as { readonly key?: string | readonly string[] };
  return key === undefined ? [] : typeof key === "string" ? [key] : key;
}

function walk(node: unknown, visit: (key: string, value: unknown, holder: DatasetRecord) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit);
    }
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value, node as DatasetRecord);
      walk(value, visit);
    }
  }
}

function asObjects(value: unknown): DatasetRecord[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is DatasetRecord => item !== null && typeof item === "object",
  );
}

function isReferenceField(key: string): boolean {
  return (/Ids?$/.test(key) || key === "organizations" || key === "catalog") && !NOT_DATASET_REFERENCES.has(key);
}

function embedded(name: CollectionName): { readonly field: string; readonly object: DatasetRecord }[] {
  return Object.keys(EMBEDDED_REFERENCES[name] ?? {}).flatMap((field) =>
    recordsOf(name).flatMap((record) => asObjects(record[field]).map((object) => ({ field, object }))),
  );
}

function recordIdsByCollection(): Map<string, CollectionName[]> {
  const ids = new Map<string, CollectionName[]>();
  for (const name of COLLECTION_NAMES) {
    for (const { id } of recordsOf(name)) {
      if (typeof id === "string") {
        ids.set(id, [...(ids.get(id) ?? []), name]);
      }
    }
  }
  return ids;
}

function idOwners(embeddedObjects: ReadonlySet<DatasetRecord>): Map<string, CollectionName> {
  const owners = new Map<string, CollectionName>();
  for (const name of COLLECTION_NAMES) {
    walk(recordsOf(name), (key, value, holder) => {
      if (key === "id" && typeof value === "string" && !embeddedObjects.has(holder) && !owners.has(value)) {
        owners.set(value, name);
      }
    });
  }
  return owners;
}

function referencesOf(name: CollectionName): Reference[] {
  const found: Reference[] = [];
  walk(recordsOf(name), (key, value) => {
    if (!isReferenceField(key)) {
      return;
    }
    for (const id of Array.isArray(value) ? value : [value]) {
      if (typeof id === "string" && id !== "") {
        found.push({ field: key, id });
      }
    }
  });
  for (const { field, object } of embedded(name)) {
    if (typeof object["id"] === "string") {
      found.push({ field: `${field}.id`, id: object["id"] });
    }
  }
  return found;
}

test.describe("dataset data", () => {
  test.describe("directories", () => {
    for (const name of COLLECTION_NAMES) {
      test(`${name} has records in ${collectionDir(name)}`, () => {
        expect(dataset[name].count).toBeGreaterThan(0);
      });
    }

    test("every directory belongs to a collection", () => {
      const dirs = readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      expect(dirs.sort()).toEqual(COLLECTION_NAMES.map(collectionDir).sort());
    });

    test("holds only JSON files", () => {
      const other = readdirSync(DATA_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
        .map((entry) => join(entry.parentPath, entry.name));

      expect(other).toEqual([]);
    });
  });

  test.describe("keys", () => {
    for (const name of COLLECTION_NAMES) {
      const fields = keyFields(name);
      if (fields.length === 0) {
        continue;
      }
      test(`${name}: ${fields.join(" + ")} is present and unique`, () => {
        const values = recordsOf(name).map((record) => fields.map((field) => record[field]));
        const incomplete = values.filter((value) => value.some((part) => typeof part !== "string" || part === ""));
        const seen = new Set<string>();
        const duplicates = values
          .map((value) => value.map((part) => String(part).toLowerCase()).join(" + "))
          .filter((value) => seen.has(value) || !seen.add(value));

        expect(incomplete).toEqual([]);
        expect(duplicates).toEqual([]);
      });
    }
  });

  test.describe("references", () => {
    const recordIds = recordIdsByCollection();
    const embeddedObjects = new Set(COLLECTION_NAMES.flatMap((name) => embedded(name).map(({ object }) => object)));
    const owners = idOwners(embeddedObjects);

    test("record ids are unique across the dataset", () => {
      const duplicates = [...recordIds]
        .filter(([, names]) => names.length > 1)
        .map(([id, names]) => `${id} in ${names.join(", ")}`);

      expect(duplicates).toEqual([]);
    });

    for (const name of COLLECTION_NAMES) {
      for (const [field, { collection, sameFields }] of Object.entries(EMBEDDED_REFERENCES[name] ?? {})) {
        const same = sameFields.length > 0 ? ` with the same ${sameFields.join(", ")}` : "";
        test(`${name}: ${field} refer to records of ${collection}${same}`, () => {
          const targets = new Map(recordsOf(collection).map((record) => [record["id"], record]));
          const problems = embedded(name).flatMap(({ field: holder, object }) => {
            if (holder !== field || object["id"] === null || object["id"] === undefined) {
              return [];
            }
            const target = targets.get(object["id"]);
            if (target === undefined) {
              return [`${String(object["id"])} is not in ${collection}`];
            }
            return sameFields
              .filter((sameField) => object[sameField] !== target[sameField])
              .map(
                (sameField) =>
                  `${String(object["id"])}: ${sameField} ${String(object[sameField])} ≠ ${String(target[sameField])}`,
              );
          });

          expect([...new Set(problems)]).toEqual([]);
        });
      }
    }

    test("nested ids that are record ids of another collection are declared as embedded references", () => {
      const undeclared = COLLECTION_NAMES.flatMap((name) => {
        const found: string[] = [];
        for (const record of recordsOf(name)) {
          walk(record, (key, value, holder) => {
            const owner = typeof value === "string" ? recordIds.get(value)?.[0] : undefined;
            if (
              key === "id" &&
              holder !== record &&
              !embeddedObjects.has(holder) &&
              owner !== undefined &&
              owner !== name
            ) {
              found.push(`${name}: nested ${String(value)} is a record of ${owner}`);
            }
          });
        }
        return found;
      });

      expect([...new Set(undeclared)]).toEqual([]);
    });

    test("every reference resolves to a record of the dataset", () => {
      const unresolved = COLLECTION_NAMES.flatMap((name) =>
        referencesOf(name)
          .filter(({ id }) => !owners.has(id))
          .map(({ field, id }) => `${name}.${field}: ${id}`),
      );

      expect([...new Set(unresolved)]).toEqual([]);
    });

    test("every collection comes after the collections it references", () => {
      const tooEarly = COLLECTION_NAMES.flatMap((name) =>
        referencesOf(name).flatMap(({ field, id }) => {
          const owner = owners.get(id);
          return owner !== undefined && COLLECTION_NAMES.indexOf(owner) > COLLECTION_NAMES.indexOf(name)
            ? [`${name}.${field} references ${owner}, which is seeded later`]
            : [];
        }),
      );

      expect([...new Set(tooEarly)]).toEqual([]);
    });

    for (const name of COLLECTION_NAMES) {
      const { parentField } = MANIFEST[name] as { readonly parentField?: string };
      if (parentField === undefined) {
        continue;
      }
      test(`${name}: ${parentField} references a record of the collection, without cycles`, () => {
        const parentOf = new Map(recordsOf(name).map((record) => [String(record["id"]), record[parentField]]));
        const problems: string[] = [];
        for (const [id, parent] of parentOf) {
          if (parent === undefined || parent === null) {
            continue;
          }
          if (typeof parent !== "string" || !parentOf.has(parent)) {
            problems.push(`${id}: parent ${String(parent)} is not in ${name}`);
            continue;
          }
          const visited = new Set([id]);
          for (let current: unknown = parent; typeof current === "string"; current = parentOf.get(current)) {
            if (visited.has(current)) {
              problems.push(`${id}: cycle through ${current}`);
              break;
            }
            visited.add(current);
          }
        }

        expect(problems).toEqual([]);
      });
    }
  });
});
