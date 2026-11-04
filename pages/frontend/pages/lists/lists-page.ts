import type { Locator, Page } from "@playwright/test";

import { exactText } from "../../../selectors";
import { ListCard, ListSettingsModal, ListSharingModal } from "../../components/wishlist";
import { MainLayout } from "../../layouts/main-layout";
import { ConfirmationModal } from "../../ui-kit/confirmation-modal";

/** Account lists page, with the modals that create, share and delete lists. */
export class ListsPage extends MainLayout {
  readonly path = "/account/lists";
  readonly createListButton: Locator;
  readonly cards: Locator;
  readonly settingsModal: ListSettingsModal;
  readonly sharingModal: ListSharingModal;
  readonly deleteModal: ConfirmationModal;

  constructor(page: Page) {
    super(page);
    this.createListButton = this.root.getByTestId("create-wishlist-button");
    this.cards = page.getByTestId("wishlist-card");
    this.settingsModal = new ListSettingsModal(page);
    this.sharingModal = new ListSharingModal(page);
    this.deleteModal = new ConfirmationModal(page.getByTestId("delete-wishlist-modal"), "delete-button");
  }

  /** @param name - List name, matched exactly. */
  card(name: string): ListCard {
    return new ListCard(
      this.cards.filter({ has: this.page.locator(".wishlist-card__title", { hasText: exactText(name) }) }),
    );
  }
}
