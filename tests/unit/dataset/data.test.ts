import type { CollectionName, CollectionSpec } from "@dataset/manifest";

import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { loadDataset } from "@dataset/dataset";
import { COLLECTION_NAMES, collectionDir, MANIFEST } from "@dataset/manifest";

const DATA_DIR = resolve(__dirname, "../../../dataset/data");

const PLACEHOLDERS = {
  STORE_ID: "store-under-test",
  FRONTEND_BASE_URL: "https://frontend.example.com",
  USERS_PASSWORD: "data-test-password",
  GOOGLE_MAPS_API_KEY: "",
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reference fields whose values are not dataset ids: external codes, platform names, links dead by design. */
const NOT_DATASET_REFERENCES = new Set(["regionId", "vendorId", "moduleId", "shoppingCartId"]);

/** A nested object that stands for a record of another collection: its `id` refers to that record. */
interface EmbeddedReference {
  readonly collection: CollectionName;
  /** Fields that must equal the referenced record's, such as a role's name. */
  readonly sameFields: readonly string[];
}

/** The embedded references of each collection, by the top-level field that holds them. */
const EMBEDDED_REFERENCES: Partial<Record<CollectionName, Readonly<Record<string, EmbeddedReference>>>> = {
  users: { roles: { collection: "roles", sameFields: ["name"] } },
  prices: { product: { collection: "products", sameFields: ["name"] } },
  products: { properties: { collection: "catalogProperties", sameFields: ["name"] } },
  notifications: { tenantIdentity: { collection: "stores", sameFields: [] } },
};

type JsonObject = Readonly<Record<string, unknown>>;

interface DataFile {
  readonly name: string;
  readonly record: Readonly<Record<string, unknown>>;
}

function spec(name: CollectionName): CollectionSpec {
  return MANIFEST[name];
}

function jsonFilesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function dataFiles(name: CollectionName): DataFile[] {
  return jsonFilesIn(join(DATA_DIR, collectionDir(name))).map((path) => ({
    name: basename(path, ".json"),
    record: JSON.parse(readFileSync(path, "utf8")) as Readonly<Record<string, unknown>>,
  }));
}

const ID_PREFIXES = COLLECTION_NAMES.flatMap((name) => spec(name).idPrefix ?? []).sort((a, b) => b.length - a.length);

function slug(value: string): string {
  const prefix = ID_PREFIXES.find((candidate) => value.startsWith(`${candidate}-`));
  if (prefix !== undefined) {
    return value.slice(prefix.length + 1);
  }
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function fields(key: string | readonly string[]): readonly string[] {
  return typeof key === "string" ? [key] : key;
}

function walk(node: unknown, visit: (key: string, value: unknown, holder: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit);
    }
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      visit(key, value, node as JsonObject);
      walk(value, visit);
    }
  }
}

function recordsOf(dataset: ReturnType<typeof loadDataset>, name: CollectionName): readonly JsonObject[] {
  return dataset[name].all() as readonly JsonObject[];
}

function asObjects(value: unknown): JsonObject[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (item): item is JsonObject => item !== null && typeof item === "object",
  );
}

function isReferenceField(key: string): boolean {
  return (/Ids?$/.test(key) || key === "organizations" || key === "catalog") && !NOT_DATASET_REFERENCES.has(key);
}

test.describe("dataset data", () => {
  test.describe("folders", () => {
    for (const name of COLLECTION_NAMES) {
      test(`${name} has records in ${collectionDir(name)}`, () => {
        expect(jsonFilesIn(join(DATA_DIR, collectionDir(name))).length).toBeGreaterThan(0);
      });
    }

    test("every folder belongs to a collection", () => {
      const folders = readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      expect(folders.sort()).toEqual(COLLECTION_NAMES.map(collectionDir).sort());
    });

    test("holds only JSON files", () => {
      const other = readdirSync(DATA_DIR, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
        .map((entry) => join(entry.parentPath, entry.name));

      expect(other).toEqual([]);
    });
  });

  test.describe("ids and file names", () => {
    for (const name of COLLECTION_NAMES) {
      const { idPrefix, keys } = spec(name);

      if (idPrefix !== undefined) {
        test(`${name}: ids are ${idPrefix}-<slug>, files <slug>.json`, () => {
          const wrong = dataFiles(name).filter(({ name: file, record }) => {
            const id = record["id"];
            return typeof id !== "string" || id !== `${idPrefix}-${file}` || !SLUG.test(file);
          });

          expect(wrong.map(({ name: file, record }) => `${file}.json: ${String(record["id"])}`)).toEqual([]);
        });
      } else if (keys?.[0] !== undefined) {
        const fileKey = fields(keys[0]);
        test(`${name}: files are named by ${fileKey.join(" + ")}`, () => {
          const wrong = dataFiles(name).filter(({ name: file, record }) => {
            const expected = fileKey.map((field) => slug(String(record[field]))).join("--");
            return file !== expected;
          });

          expect(wrong.map(({ name: file }) => `${file}.json`)).toEqual([]);
        });
      }
    }
  });

  test.describe("keys", () => {
    const dataset = loadDataset(PLACEHOLDERS);

    for (const name of COLLECTION_NAMES) {
      for (const key of spec(name).keys ?? []) {
        const keyFields = fields(key);
        test(`${name}: ${keyFields.join(" + ")} is present and unique`, () => {
          const records = dataset[name].all() as readonly Readonly<Record<string, unknown>>[];
          const values = records.map((record) => keyFields.map((field) => record[field]));
          const incomplete = values.filter((value) => value.some((part) => typeof part !== "string" || part === ""));
          const seen = new Set<string>();
          const duplicates = values
            .map((value) => value.map((part) => String(part).toLowerCase()).join(" + "))
            .filter((value) => seen.has(value) || !seen.add(value));

          expect(incomplete).toEqual([]);
          expect(duplicates).toEqual([]);
        });
      }
    }
  });

  test.describe("references", () => {
    const dataset = loadDataset(PLACEHOLDERS);

    const recordIds = new Map<string, CollectionName[]>();
    for (const name of COLLECTION_NAMES) {
      for (const { id } of recordsOf(dataset, name)) {
        if (typeof id === "string") {
          recordIds.set(id, [...(recordIds.get(id) ?? []), name]);
        }
      }
    }

    function embedded(name: CollectionName): { readonly field: string; readonly object: JsonObject }[] {
      return Object.keys(EMBEDDED_REFERENCES[name] ?? {}).flatMap((field) =>
        recordsOf(dataset, name).flatMap((record) => asObjects(record[field]).map((object) => ({ field, object }))),
      );
    }

    const embeddedObjects = new Set(COLLECTION_NAMES.flatMap((name) => embedded(name).map(({ object }) => object)));

    const owners = new Map<string, CollectionName>();
    for (const name of COLLECTION_NAMES) {
      walk(dataset[name].all(), (key, value, holder) => {
        if (key === "id" && typeof value === "string" && !embeddedObjects.has(holder) && !owners.has(value)) {
          owners.set(value, name);
        }
      });
    }

    function references(name: CollectionName): { readonly field: string; readonly id: string }[] {
      const found: { field: string; id: string }[] = [];
      walk(dataset[name].all(), (key, value) => {
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
          const targets = new Map(recordsOf(dataset, collection).map((record) => [record["id"], record]));
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
        for (const record of recordsOf(dataset, name)) {
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
        references(name)
          .filter(({ id }) => !owners.has(id))
          .map(({ field, id }) => `${name}.${field}: ${id}`),
      );

      expect([...new Set(unresolved)]).toEqual([]);
    });

    test("every collection comes after the collections it references", () => {
      const tooEarly = COLLECTION_NAMES.flatMap((name) =>
        references(name).flatMap(({ field, id }) => {
          const owner = owners.get(id);
          return owner !== undefined && COLLECTION_NAMES.indexOf(owner) > COLLECTION_NAMES.indexOf(name)
            ? [`${name}.${field} references ${owner}, which is seeded later`]
            : [];
        }),
      );

      expect([...new Set(tooEarly)]).toEqual([]);
    });

    for (const name of COLLECTION_NAMES) {
      const { parentField } = spec(name);
      if (parentField === undefined) {
        continue;
      }
      test(`${name}: ${parentField} references a record of the collection, without cycles`, () => {
        const records = dataset[name].all() as readonly Readonly<Record<string, unknown>>[];
        const parentOf = new Map(records.map((record) => [String(record["id"]), record[parentField]]));
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
