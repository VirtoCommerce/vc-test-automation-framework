import type { Locator, Page } from "@playwright/test";
import type { QuantityControlKind } from "../../ui-kit/quantity-control";

import { productItem, productItems } from "../../components/catalog/product-items";
import { LineItem } from "../../components/line-item";
import { MainLayout } from "../../layouts/main-layout";
import { ConfirmationModal } from "../../ui-kit/confirmation-modal";

/** Account's saved-for-later page. */
export class SavedForLaterPage extends MainLayout {
  readonly path = "/account/saved-for-later";
  readonly lineItems: Locator;
  readonly removeItemModal: ConfirmationModal;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.lineItems = productItems(this.root);
    this.removeItemModal = new ConfirmationModal(page.getByTestId("delete-wishlist-product-modal"), "delete-button");
  }

  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.root, sku), this.#quantityControl);
  }
}
