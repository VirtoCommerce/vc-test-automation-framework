# QA Explore

Spawn the `qa-explorer` agent once to map an area of the frontend or the API on the stand and write a report. It
writes no test code.

`$ARGUMENTS` is the area: a page, a module or an API area ("the cart page", "the orders API"). No arguments: ask
for one.

Dispatch the agent fresh with the area in the person's own words and nothing else. It reads `framework-rules` and
`project-facts`, explores read-only, and writes its report under `.qa/reports/`.

Show the report path and its findings: pages and selectors, missing test ids, operations, page-object proposals.
Do not start planning; end with:
```
Report: .qa/reports/<file>
Next: /qa-plan "<area>" to plan tests for it, or /qa-coverage to see what is already tested.
```
