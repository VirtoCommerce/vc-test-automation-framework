---
name: explore-frontend
description: "Map an area of a frontend on the stand: its pages, the selectors in the framework's priority, the test ids that are missing, and a page-object proposal. Read-only; writes only the report under .qa/reports/"
argument-hint: "<page-or-area>"
---

## Explore Frontend

Used by `qa-explorer`. The result is the first four sections of `.qa/reports/explore-<slug>.md`. It writes no
page object and no test; the proposal is text for `qa-planner` and `qa-automation-expert`. Read first: the skill
`framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`).

## Step 1: What Exists

- Search the page objects, components and specs for the area (Grep, Glob) and read the ones that match. Note each
  page object's path, its locators and the test ids it uses.
- Read the knowledge snapshot (`knowledgeDir`) for the area. Use what it says; open a page only for what it
  cannot answer or what its date makes unsafe.
- Find where the frontend source lives from the project facts or the repository's README. No pointer: the source
  comparison in step 4 is "source not available".

## Step 2: Pages

Walk the area with the browser as `qa-explorer` allows. For each page or state reached, one row:

| Path | What it shows | Reached as | Page object |
|---|---|---|---|

`Reached as` is the role or "anonymous"; `Page object` is the existing class, or `none`. Dialogs, tabs and states
the user can reach on the page (empty, filled, error shown) are rows of their own. A page you could not reach is
a row with `not reached: <why>`.

## Step 3: Selectors

From the page snapshot and the shipped page extractor (`browser_evaluate` with `PAGE_EXTRACTOR` from
`.claude/checks/explore-extractors.mts`, the only script the hook allows), list the elements a test
would use: for each, the best selector in the framework's order from `create-ui-layer` "Locator Conventions":

1. the test id attribute (`getByTestId`);
2. a data attribute that names the item (a SKU, an id);
3. a component class, only where no test id exists;
4. anything else (text, position, generated class names) is marked `fragile`.

One row per element: `name`, `selector`, `kind` (test id, data attribute, class, fragile), `seen on` (the page).
Mark which already exist in a page object. Never write a selector you did not see in the page.

## Step 4: Missing Test Ids

List the elements a test needs but that carry no test id: the element, the page, the selector it would use today
and why that is fragile. Add the elements whose test id differs between the page object and the page.

When the source is available, also compare: test ids the page objects use that the source no longer has, and
elements in the source with no test id. Name the source file and line for each. Without the source, write
"source not available" and compare against the live page only.

These are requests to the frontend team: give each as one line they can act on.

## Step 5: Page-Object Proposal

For each page or component with no page object, or whose page object lacks a locator or action: a short outline,
not code. Name the class, where it would live under the repository's layer rules, its `readonly` locators (name and
the selector from step 3), its actions and what each waits for, and which existing page object it extends or reuses.
Say which proposed locators wait on a missing test id from step 4.

## Observing for a Contract

The explorer's `observe` mode records the value one case asserts, as the page shows it. First confirm from the page
(the account menu) that the signed-in account is `roles[<the case's data role>]`, or that no one is signed in for
`none`; otherwise write `not reached: needs <role>`.

## Done

The four sections are in the report, each with its items or `none observed`, and every item says where it was seen.
Nothing outside `.qa/reports/` changed (`git status`).

## Example from this repository

- Test id attribute: `data-test-id` (`testIdAttribute` in `playwright.config.ts`).
- Page objects: `pages/frontend/pages/<area>/`, components `pages/frontend/components/`, UI-kit wrappers
  `pages/frontend/ui-kit/`; the factory is `pages/frontend/frontend.ts`.
