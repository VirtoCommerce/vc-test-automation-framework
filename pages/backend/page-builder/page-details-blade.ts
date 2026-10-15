import type { Locator } from "@playwright/test";
import type { Card } from "../vc-shell/card";
import type { DatePicker } from "../vc-shell/date-picker";
import type { Select } from "../vc-shell/select";
import type { Switch } from "../vc-shell/switch";

import { expect } from "@playwright/test";

import { whenResponse } from "../../responses";
import { Blade, DISABLED_TOOLBAR_BUTTON } from "../vc-shell/blade";
import { ConfirmationPopup } from "../vc-shell/feedback";
import { isPagePublishing, isPageSave } from "./requests";
import { DetailsToolbar } from "./routes";

/** Text fields for {@link PageDetailsBlade.fill}; omitted fields are left untouched. */
export interface PageFields {
  readonly name?: string;
  readonly permalink?: string;
}

/**
 * Blade that shows and edits one page. Expand {@link personalizationSection} or {@link schedulingSection} before
 * using their fields. Field setters do not save; call {@link save}.
 */
export class PageDetailsBlade extends Blade {
  readonly personalizationSection: Card;
  readonly schedulingSection: Card;
  readonly nameInput: Locator;
  readonly permalinkInput: Locator;
  /** Frontend URL shown before the permalink input. */
  readonly permalinkPrefix: Locator;
  readonly language: Select;
  readonly userGroups: Select;
  readonly organization: Select;
  /** Visibility switch input; read its checked state, change it with {@link setVisibility}. */
  readonly visibilityToggle: Locator;
  readonly startDate: DatePicker;
  readonly endDate: DatePicker;
  readonly saveButton: Locator;
  readonly #visibility: Switch;

  constructor(root: Locator) {
    super(root);
    this.personalizationSection = this.card("Personalization & Access control");
    this.schedulingSection = this.card("Scheduling");
    this.nameInput = this.textInput("Name*");
    this.permalinkInput = this.textInput("Permalink*");
    this.permalinkPrefix = this.field("Permalink*").getByTestId("permalink-prefix");
    this.language = this.select("Language");
    this.userGroups = this.select("User groups");
    this.organization = this.select("Organization");
    this.#visibility = this.firstSwitch();
    this.visibilityToggle = this.#visibility.input;
    this.startDate = this.datePicker("Start date");
    this.endDate = this.datePicker("End date");
    this.saveButton = this.toolbarButton(DetailsToolbar.save);
  }

  /** Types the given name and permalink; does not save. */
  async fill(fields: PageFields): Promise<void> {
    if (fields.name !== undefined) {
      await this.nameInput.fill(fields.name);
    }
    if (fields.permalink !== undefined) {
      await this.permalinkInput.fill(fields.permalink);
    }
  }

  /** Toggles the visibility switch only if it differs from `visible`; does not save. */
  async setVisibility(visible: boolean): Promise<void> {
    await this.#visibility.set(visible);
  }

  /** Clicks save and waits for the save response (POST/PUT), whatever its status; assert the outcome after. */
  async save(): Promise<void> {
    await whenResponse(this.root.page(), isPageSave, () => this.saveButton.click());
  }

  /** Waits for the publish button to be enabled, clicks it and waits for a successful publishing response. */
  async publish(): Promise<void> {
    await this.#changeStatus(DetailsToolbar.publish);
  }

  /** Waits for the unpublish button to be enabled, clicks it and waits for a successful publishing response. */
  async unpublish(): Promise<void> {
    await this.#changeStatus(DetailsToolbar.unpublish);
  }

  async #changeStatus(itemId: string): Promise<void> {
    const button = this.toolbarButton(itemId);
    await expect(button).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
    await whenResponse(this.root.page(), isPagePublishing, () => button.click());
  }

  /** Clicks archive and confirms the popup; waits for the popup to close, not for a response. */
  async archive(): Promise<void> {
    await this.toolbarButton(DetailsToolbar.archive).click();
    await new ConfirmationPopup(this.root.page()).confirm();
  }
}
