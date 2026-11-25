# Page objects

The page objects of the frontend. Specs and fixtures import them through the `@pages` alias; files inside this
directory import each other by relative paths. Page objects import only Playwright and other page objects.

- **One class per file, and the file is named after the class** in kebab case: `AccountMenu` is in `account-menu.ts`.
- **Locators are `readonly` fields built in the constructor.** Specs hold no raw selectors.
- **There are no `index.ts` files.** An import always shows the file that holds the class.

The directory is empty until the first browser test needs a page object.
