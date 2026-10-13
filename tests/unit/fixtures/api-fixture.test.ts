import { expect, test } from "@playwright/test";

import { missingModules } from "../../../fixtures/api.fixture";

test.describe("missingModules", () => {
  test("returns the required modules that are not installed, in the given order", () => {
    expect(
      missingModules(
        ["VirtoCommerce.WhiteLabeling", "VirtoCommerce.Core", "VirtoCommerce.Quote"],
        new Set(["VirtoCommerce.Core"]),
      ),
    ).toEqual(["VirtoCommerce.WhiteLabeling", "VirtoCommerce.Quote"]);
  });

  test("returns nothing when every required module is installed", () => {
    expect(missingModules(["VirtoCommerce.Core"], new Set(["VirtoCommerce.Core", "VirtoCommerce.Catalog"]))).toEqual(
      [],
    );
  });
});
