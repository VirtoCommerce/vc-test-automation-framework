import type { Locator } from "@playwright/test";

/**
 * A side panel of the page designer that edits one thing: a section, the page settings or the page header. Its
 * fields react to key events, not to `input`, so the setters type or press a key after filling.
 */
export class DesignerPanel {
  readonly root: Locator;
  readonly backButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.backButton = root.getByRole("button", { name: "Back" });
  }

  /** The field whose label is exactly `label`: the control element that holds the label. */
  field(label: string): Locator {
    return this.root.locator("label.pb-label", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).locator("..");
  }

  /** The text input of the field labelled `label`. */
  textInput(label: string): Locator {
    return this.field(label).getByRole("textbox").first();
  }

  /** Expands a collapsed group of fields, such as "SEO Information". */
  async expand(group: string): Promise<void> {
    await this.root.getByText(group, { exact: true }).click();
  }

  checkbox(name: string): Locator {
    return this.root.getByRole("checkbox", { name });
  }

  tab(name: string): Locator {
    return this.root.getByRole("tab", { name });
  }

  /** Replaces a text field's value; the designer registers it on the key press that follows. */
  async fillText(label: string, value: string): Promise<void> {
    const input = this.textInput(label);
    await input.fill(value);
    await input.press("End");
  }

  /** Types `text` at the end of a Markdown field's content. */
  async appendMarkdown(label: string, text: string): Promise<void> {
    await this.field(label).locator(".CodeMirror-code").click();
    await this.root.page().keyboard.press("ControlOrMeta+End");
    await this.root.page().keyboard.type(text);
  }
}
