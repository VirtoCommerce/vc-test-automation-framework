import * as allure from "allure-js-commons";

import { PackageTypesClient } from "@api/rest/clients/package-types-client";
import { uniqueId } from "@core/unique-id";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Core / Package Types");
});

test.describe("package types (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("create a package type", async ({ httpClient, cleanupStack }) => {
    const packageTypesClient = new PackageTypesClient(httpClient);
    const id = uniqueId("test-package-type");
    cleanupStack.push(`delete package type ${id}`, () => packageTypesClient.delete(id));

    await test.step("act: create package type", () => packageTypesClient.create({ id, name: id }));

    await test.step("assert: package type is listed", async () => {
      expect(await packageTypesClient.find(id)).toMatchObject({ id, name: id });
    });
  });

  test("rename a package type", async ({ httpClient, cleanupStack }) => {
    const packageTypesClient = new PackageTypesClient(httpClient);
    const id = uniqueId("test-package-type");
    cleanupStack.push(`delete package type ${id}`, () => packageTypesClient.delete(id));
    await test.step("arrange: package type", () => packageTypesClient.create({ id, name: id }));
    const newName = `${id}-renamed`;

    await test.step("act: rename package type", () => packageTypesClient.update({ id, name: newName }));

    await test.step("assert: package type has the new name", async () => {
      expect((await packageTypesClient.find(id))?.name).toBe(newName);
    });
  });

  test("delete a package type", async ({ httpClient, cleanupStack }) => {
    const packageTypesClient = new PackageTypesClient(httpClient);
    const id = uniqueId("test-package-type");
    cleanupStack.push(`delete package type ${id}`, () => packageTypesClient.delete(id));
    await test.step("arrange: package type", () => packageTypesClient.create({ id, name: id }));

    await test.step("act: delete package type", () => packageTypesClient.delete(id));

    await test.step("assert: package type is not listed", async () => {
      expect(await packageTypesClient.find(id)).toBeUndefined();
    });
  });
});
