import type { Locator, Page } from "@playwright/test";

import { exactText } from "../../selectors";
import { ConfirmationModal } from "../components/controls";
import { CouponCard } from "../components/coupons";
import { productItems } from "../components/product";
import { ListCard, ListSettingsModal, ListSharingModal } from "../components/wishlist";
import { FrontendPage } from "./layout";

/** Account lists page, with the modals that create, share and delete lists. */
export class ListsPage extends FrontendPage {
  readonly path = "/account/lists";
  readonly createListButton: Locator;
  readonly cards: Locator;
  readonly settingsModal: ListSettingsModal;
  readonly sharingModal: ListSharingModal;
  readonly deleteModal: ConfirmationModal;

  constructor(page: Page) {
    super(page);
    this.createListButton = this.root.locator("[data-test-id='create-wishlist-button']");
    this.cards = page.locator("[data-test-id='wishlist-card']");
    this.settingsModal = new ListSettingsModal(page);
    this.sharingModal = new ListSharingModal(page);
    this.deleteModal = new ConfirmationModal(page.locator("[data-test-id='delete-wishlist-modal']"), "delete-button");
  }

  /** @param name - List name, matched exactly. */
  card(name: string): ListCard {
    return new ListCard(
      this.cards.filter({ has: this.page.locator(".wishlist-card__title", { hasText: exactText(name) }) }),
    );
  }
}

/** Details page of one of the account's lists. */
export class ListDetailsPage extends FrontendPage {
  readonly path: string;
  readonly lineItems: Locator;
  readonly addAllToCartButton: Locator;

  constructor(page: Page, listId: string) {
    super(page);
    this.path = `/account/lists/${listId}`;
    this.lineItems = productItems(this.root);
    this.addAllToCartButton = page.locator("[data-test-id='add-all-to-cart-button']");
  }
}

/** List opened by its share link, possibly by another user or anonymously. */
export class SharedListPage extends FrontendPage {
  readonly path: string;
  readonly listTitle: Locator;
  readonly lineItems: Locator;
  readonly addToCartControls: Locator;
  /** "404" heading shown when the link is invalid or the list is no longer shared. */
  readonly notFound: Locator;

  /** @param sharingKey - Key from the share link (the list's sharing setting id). */
  constructor(page: Page, sharingKey: string) {
    super(page);
    this.path = `/shared-list/${sharingKey}`;
    this.listTitle = page.locator(".shared-list__name");
    this.lineItems = productItems(this.root);
    this.addToCartControls = page.locator("[data-test-id='add-to-cart-component']");
    this.notFound = page.getByRole("heading", { name: "404" });
  }
}

/** Account coupons page: the store's coupons the signed-in customer can use, each with a copy button. */
export class CouponsPage extends FrontendPage {
  readonly path = "/account/coupons";
  readonly cards: Locator;

  constructor(page: Page) {
    super(page);
    this.cards = page.locator(".coupon-item");
  }

  card(index: number): CouponCard {
    return new CouponCard(this.cards.nth(index));
  }

  /** Reads the clipboard; needs the `clipboard-read` permission. */
  clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
  }
}
