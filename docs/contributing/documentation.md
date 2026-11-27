# Documentation

The documentation has four parts, and each part has its own way of staying accurate.

| Part                   | Location                                  | Kept accurate by                                                            |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| README                 | `README.md`                               | Kept short: what the package is, its requirements and its installation      |
| Guides                 | `docs/getting-started.md`, `docs/guides/` | Their examples are type-checked files                                       |
| Concepts               | `docs/concepts/`                          | Updated in the same pull request as the area they describe                  |
| Documentation comments | `src/`                                    | `docs:check` fails for an export without one; the review checks their links |

## Rules

- A pull request that changes the public API of an area updates the concept page of that area.
- Code in the documentation that uses the framework lives in `docs/examples/` as a TypeScript file. The examples are
  type-checked against the current source by `npm run typecheck`, so a change to the API that breaks an example fails
  the build.
- A page embeds an example with an `example` marker followed by an empty or outdated `ts` block. `npm run docs:sync`
  copies the file into the block, and `npm run docs:check` fails when a block differs from its file.
- `npm run docs:check` also fails for a relative link to a missing file or a missing heading, and for an export in
  `src` without a documentation comment, including exports that only other files of the same area use.

## Links in documentation comments

No script checks a `{@link}` in a documentation comment. The review of a pull request checks that each one names an
export of the area, or a member of one, and that it still exists after a rename.
