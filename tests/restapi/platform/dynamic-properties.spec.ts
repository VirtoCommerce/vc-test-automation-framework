import { randomUUID } from "node:crypto";

import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const CONTACT_TYPE = "VirtoCommerce.CustomerModule.Core.Model.Contact";
const STORE_TYPE = "VirtoCommerce.StoreModule.Core.Model.Store";
const STORE_ADMINISTRATOR = "acme_store_administrator@acme.com";
const OBJECT_TYPES = [
  ...[
    "VirtoCommerce.CartModule.Core.Model.LineItem",
    "VirtoCommerce.CartModule.Core.Model.Payment",
    "VirtoCommerce.CartModule.Core.Model.Shipment",
    "VirtoCommerce.CartModule.Core.Model.ShoppingCart",
    "VirtoCommerce.ContentModule.Core.Model.FrontMatterHeaders",
    CONTACT_TYPE,
    "VirtoCommerce.CustomerModule.Core.Model.Employee",
    "VirtoCommerce.CustomerModule.Core.Model.Organization",
    "VirtoCommerce.CustomerModule.Core.Model.Vendor",
    "VirtoCommerce.MarketingModule.Core.Model.DynamicContentItem",
    "VirtoCommerce.OrdersModule.Core.Model.CustomerOrder",
    "VirtoCommerce.OrdersModule.Core.Model.LineItem",
    "VirtoCommerce.OrdersModule.Core.Model.PaymentIn",
    "VirtoCommerce.OrdersModule.Core.Model.Shipment",
    STORE_TYPE,
  ].map((objectType) => ({ objectType, requiresModules: [] })),
  { objectType: "VirtoCommerce.QuoteModule.Core.Model.QuoteRequest", requiresModules: [MODULES.quote] },
];
const VALUE_TYPES = [
  { title: "ShortText (array)", valueType: "ShortText", isArray: true, isMultilingual: false, isDictionary: false },
  {
    title: "ShortText (multilingual)",
    valueType: "ShortText",
    isArray: false,
    isMultilingual: true,
    isDictionary: false,
  },
  {
    title: "ShortText (dictionary)",
    valueType: "ShortText",
    isArray: false,
    isMultilingual: false,
    isDictionary: true,
  },
  { title: "LongText", valueType: "LongText", isArray: false, isMultilingual: false, isDictionary: false },
  { title: "Integer", valueType: "Integer", isArray: false, isMultilingual: false, isDictionary: false },
  { title: "Decimal", valueType: "Decimal", isArray: false, isMultilingual: false, isDictionary: false },
  { title: "DateTime", valueType: "DateTime", isArray: false, isMultilingual: false, isDictionary: false },
  { title: "Boolean", valueType: "Boolean", isArray: false, isMultilingual: false, isDictionary: false },
  { title: "Html", valueType: "Html", isArray: false, isMultilingual: false, isDictionary: false },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Dynamic Properties");
});

test.describe("dynamic properties (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list the object types that support dynamic properties", async ({ api }) => {
    await allure.story("Object types");
    await allure.description("Stores and contacts are listed among the object types that support dynamic properties.");

    const objectTypes = await test.step("act: list the object types", () =>
      api.rest.dynamicProperties.listObjectTypes());

    await test.step("assert: Store and Contact are listed", () => {
      expect(objectTypes).toEqual(expect.arrayContaining([STORE_TYPE, CONTACT_TYPE]));
    });
  });

  for (const { title, ...flags } of VALUE_TYPES) {
    test(`create a ${title} dynamic property`, async ({ api, cleanup }) => {
      await allure.story("Value types");
      await allure.description(`A ${title} property keeps its value type and flags.`);
      const name = uniqueId(`test_${flags.valueType}`);
      const id = randomUUID();
      cleanup.push(`delete dynamic property ${name}`, () => api.rest.dynamicProperties.delete([id]));

      const property = await test.step(`act: create a ${title} property`, () =>
        api.rest.dynamicProperties.create({ id, objectType: CONTACT_TYPE, name, ...flags }));

      await test.step("assert: the property keeps its value type and flags", () => {
        expect(property).toMatchObject(flags);
      });
    });
  }

  test("search the dynamic properties of one object type", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Of two properties with the same name, a search by object type finds only its own.");
    const name = uniqueId("test_property");
    const contactProperty = await test.step("arrange: a Contact property", () =>
      arrange.platform.dynamicProperty(CONTACT_TYPE, { name }));
    await test.step("arrange: a Store property with the same name", () =>
      arrange.platform.dynamicProperty(STORE_TYPE, { name }));

    const found = await test.step("act: search Contact properties by the name", () =>
      api.rest.dynamicProperties.search({ objectType: CONTACT_TYPE, keyword: name }));

    await test.step("assert: only the Contact property is found", () => {
      expect(found.map(({ id }) => id)).toEqual([contactProperty.id]);
    });
  });
});

for (const { objectType, requiresModules } of OBJECT_TYPES) {
  const typeTitle = objectType.replace("VirtoCommerce.", "").replace(".Core.Model.", " ");

  test.describe(`dynamic properties of ${typeTitle} (store administrator)`, () => {
    test.use({ user: STORE_ADMINISTRATOR, requiresModules });

    test(`create and find a dynamic property of ${typeTitle}`, async ({ api, cleanup }) => {
      await allure.story("Object types");
      await allure.description(`A ShortText property of ${typeTitle} is found by its object type and name.`);
      const name = uniqueId("test_property");
      const id = randomUUID();
      cleanup.push(`delete dynamic property ${name}`, () => api.rest.dynamicProperties.delete([id]));

      const property = await test.step("act: create a property", () =>
        api.rest.dynamicProperties.create({ id, objectType, name, valueType: "ShortText" }));

      await test.step("assert: the property is found for its object type", async () => {
        expect(await api.rest.dynamicProperties.search({ objectType, keyword: name })).toEqual([
          expect.objectContaining({ id: property.id, name, objectType }),
        ]);
      });
    });
  });
}
