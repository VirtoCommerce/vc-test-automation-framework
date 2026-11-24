import type {
  VirtoCommercePlatformCoreDynamicPropertiesDynamicProperty as DynamicProperty,
  VirtoCommercePlatformCoreDynamicPropertiesDynamicPropertySearchResult as DynamicPropertySearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { ModuleRequirement } from "@virtocommerce/test-automation-framework/modules";

import { randomUUID } from "node:crypto";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { uniqueId } from "@support/unique-id.ts";

const PROPERTIES_PATH = "/api/platform/dynamic/properties";
const CONTACT_TYPE = "VirtoCommerce.CustomerModule.Core.Model.Contact";
const STORE_TYPE = "VirtoCommerce.StoreModule.Core.Model.Store";
const OBJECT_TYPES: readonly { readonly objectType: string; readonly modules: Record<string, ModuleRequirement> }[] = [
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
  ].map((objectType) => ({ objectType, modules: {} })),
  { objectType: "VirtoCommerce.QuoteModule.Core.Model.QuoteRequest", modules: { quote: MODULES.quote } },
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

test.describe("dynamic properties (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list the object types that support dynamic properties", async ({ api }) => {
    const objectTypes = await test.step("act: list the object types", async () =>
      (await api.get("/api/platform/dynamic/types")).expectOk().json<string[]>());

    await test.step("assert: Store and Contact are listed", () => {
      expect(objectTypes).toEqual(expect.arrayContaining([STORE_TYPE, CONTACT_TYPE]));
    });
  });

  for (const { title, ...flags } of VALUE_TYPES) {
    test(`create a ${title} dynamic property`, async ({ api, arrange }) => {
      const id = randomUUID();
      arrange.platform.deleteDynamicPropertyLater(id);

      const property = await test.step(`act: create a ${title} property`, async () =>
        (
          await api.post(PROPERTIES_PATH, {
            json: { id, objectType: CONTACT_TYPE, name: uniqueId(`test_${flags.valueType}`), ...flags },
          })
        )
          .expectOk()
          .json<DynamicProperty>());

      await test.step("assert: the property keeps its value type and flags", () => {
        expect(property).toMatchObject(flags);
      });
    });
  }

  test("search the dynamic properties of one object type", async ({ api, arrange }) => {
    const name = uniqueId("test_property");
    const contactProperty = await test.step("arrange: a Contact property", () =>
      arrange.platform.dynamicProperty(CONTACT_TYPE, { name }));
    await test.step("arrange: a Store property with the same name", () =>
      arrange.platform.dynamicProperty(STORE_TYPE, { name }));

    const found = await test.step("act: search Contact properties by the name", () =>
      propertiesOf(api, CONTACT_TYPE, name));

    await test.step("assert: only the Contact property is found", () => {
      expect(found.map(({ id }) => id)).toEqual([contactProperty.id]);
    });
  });
});

for (const { objectType, modules } of OBJECT_TYPES) {
  const typeTitle = objectType.replace("VirtoCommerce.", "").replace(".Core.Model.", " ");

  test.describe(`dynamic properties of ${typeTitle} (store administrator)`, () => {
    test.use({ user: STORE_ADMINISTRATOR, modules });

    test(`create and find a dynamic property of ${typeTitle}`, async ({ api, arrange }) => {
      const name = uniqueId("test_property");
      const id = randomUUID();
      arrange.platform.deleteDynamicPropertyLater(id);

      const property = await test.step("act: create a property", async () =>
        (await api.post(PROPERTIES_PATH, { json: { id, objectType, name, valueType: "ShortText" } }))
          .expectOk()
          .json<DynamicProperty>());

      await test.step("assert: the property is found for its object type", async () => {
        expect(await propertiesOf(api, objectType, name)).toEqual([
          expect.objectContaining({ id: property.id, name, objectType }),
        ]);
      });
    });
  });
}

async function propertiesOf(api: HttpClient, objectType: string, keyword: string): Promise<DynamicProperty[]> {
  const response = await api.post(`${PROPERTIES_PATH}/search`, { json: { objectType, keyword } });
  return response.expectOk().json<DynamicPropertySearchResult>().results ?? [];
}
