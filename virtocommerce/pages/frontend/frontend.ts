import type { Page } from "@playwright/test";
import type { RangeFilterKind } from "./components/catalog/price-filter.ts";
import type { CheckoutMode } from "./flows/checkout-flow.ts";
import type { QuantityControlKind } from "./ui-kit/quantity-control.ts";

import { EditAddressModal } from "./components/address/edit-address-modal.ts";
import { PickupLocationsModal } from "./components/address/pickup-locations-modal.ts";
import { SelectAddressModal } from "./components/address/select-address-modal.ts";
import { AddToListsModal } from "./components/lists/add-to-lists-modal.ts";
import { CheckoutFlow } from "./flows/checkout-flow.ts";
import { CouponsPage } from "./pages/account/coupons-page.ts";
import { SavedForLaterPage } from "./pages/account/saved-for-later-page.ts";
import { CartPage } from "./pages/cart/cart-page.ts";
import { CategoryPage } from "./pages/catalog/category-page.ts";
import { ProductPage } from "./pages/catalog/product-page.ts";
import { ListDetailsPage } from "./pages/lists/list-details-page.ts";
import { ListsPage } from "./pages/lists/lists-page.ts";
import { SharedListPage } from "./pages/lists/shared-list-page.ts";
import { ContentPage } from "./pages/site/content-page.ts";
import { HomePage } from "./pages/site/home-page.ts";
import { SignInPage } from "./pages/site/sign-in-page.ts";

/** Frontend configuration the page objects adapt to: quantity control, range filter and checkout mode. */
export interface FrontendSettings {
  readonly quantityControl: QuantityControlKind;
  readonly rangeFilterType: RangeFilterKind;
  readonly checkoutMode: CheckoutMode;
}

/**
 * Factory of frontend page objects (the `frontend` fixture), built for the configured settings so specs never branch
 * on quantity control, range filter or checkout mode. Each method returns a new page object; call `navigate()` on it.
 * Modals are shared fields, since they open over any page.
 *
 * @example
 * const cart = frontend.cart();
 * await cart.navigate();
 * await cart.lineItem(sku).quantity.setQuantity(4);
 */
export class Frontend {
  readonly page: Page;
  readonly settings: FrontendSettings;
  readonly editAddressModal: EditAddressModal;
  readonly selectAddressModal: SelectAddressModal;
  readonly pickupLocationsModal: PickupLocationsModal;
  readonly addToListsModal: AddToListsModal;

  constructor(page: Page, settings: FrontendSettings) {
    this.page = page;
    this.settings = settings;
    this.editAddressModal = new EditAddressModal(page);
    this.selectAddressModal = new SelectAddressModal(page);
    this.pickupLocationsModal = new PickupLocationsModal(page);
    this.addToListsModal = new AddToListsModal(page);
  }

  home(): HomePage {
    return new HomePage(this.page);
  }

  coupons(): CouponsPage {
    return new CouponsPage(this.page);
  }

  signIn(): SignInPage {
    return new SignInPage(this.page);
  }

  /** @param permalink - Content page permalink, such as `/about-store`. */
  content(permalink: string): ContentPage {
    return new ContentPage(this.page, permalink);
  }

  /**
   * Category page, sorted by ascending price.
   * @param categoryPath - Category path, such as `smartphones`.
   */
  category(categoryPath: string): CategoryPage {
    return new CategoryPage(this.page, categoryPath, this.settings);
  }

  /** @param productPath - Product path, such as `laptops/acer-predator-helios-neo-16-ai`. */
  product(productPath: string): ProductPage {
    return new ProductPage(this.page, productPath);
  }

  cart(): CartPage {
    return new CartPage(this.page, this.settings.quantityControl);
  }

  /** Checkout steps for the configured checkout mode; see {@link CheckoutFlow}. */
  checkout(): CheckoutFlow {
    return new CheckoutFlow(this.page, this.settings.checkoutMode, this.settings.quantityControl);
  }

  lists(): ListsPage {
    return new ListsPage(this.page);
  }

  /** Details page of one of the account's lists. */
  list(listId: string): ListDetailsPage {
    return new ListDetailsPage(this.page, listId);
  }

  /** @param sharingKey - Key from the share link (the list's sharing setting id). */
  sharedList(sharingKey: string): SharedListPage {
    return new SharedListPage(this.page, sharingKey);
  }

  savedForLater(): SavedForLaterPage {
    return new SavedForLaterPage(this.page, this.settings.quantityControl);
  }
}
