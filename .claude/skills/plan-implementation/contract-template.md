# Contract: <ticket key, or area name> <short title>

<!-- Save as .qa/contracts/<ticket-key-or-slug>.md. The check ignores comments; leave them out of the file you write. -->

## Source

ticket: <key>

<!-- The first line is one of: `ticket: <key>`, `doc: <link or page>`, `area: <name>`, `gap: <gap id from the coverage report>`. Extra lines: the card path, the documentation pages, the explorer report. A line that names a file under `.qa/reports/` or `.qa/kb/` ends with the day you read it, `(<yyyy-mm-dd>)`, as in `explorer report: .qa/reports/explore-cart.md (2026-11-20)`; the check refuses one with no date, or one whose file changed after it. Read these files again before you ask for approval. -->

## Scope

- <behaviour under test, one line each, in the words of the criterion or the documented rule>

## Out of scope

- <what is not tested and why: another ticket, covered by an existing spec, needs a module the stand lacks>

## Existing coverage

- Covered: <criterion> by <spec file>
- Reusable building blocks: <names>
- Gaps: <what is missing>

<!-- What the repository's specs already cover and the building blocks that exist, found by searching them (`plan-test-strategy` Step 2). A criterion already covered is listed here, not planned again. When the search finds nothing, say `None found` and what you searched. -->

## Cases

| Case | Technique | Project | Data role | Critical flow | Parameters | Oracle |
|---|---|---|---|---|---|---|
| <id> <what it shows> | <equivalence partitioning, boundary value analysis, decision table, state transition, pairwise, error guessing, negative, regression> | <a key of commands.test in the facts> | <a role from the facts> | <a flow of critical in the facts, or no> | <the request parameters that change the answer, with the values the case sends, or none> | ticket: <criterion> |

<!-- Critical flow names the flow of `critical` in the facts that the case belongs to, or `no`. Parameters states every request parameter whose value changes the answer (a quantity, a page size, a filter, a sort, a culture, a currency, a store) with the value this case sends; `none` only when the answer depends on none. A case that must be run on its own (state changes on an account the other cases share) says so here. A case without an account says `none` in Data role; several roles are separated by commas. Every Oracle cell starts with the source of the expected value: `ticket:`, `doc:`, `schema:` or `observed:`. Several sources are separated by `;`, each starting with its own prefix. An `observed:` part holds the value the explorer recorded and the report it is in, `observed: <value> (.qa/reports/explore-<slug>-observed.md)`, the value written as the report's line `- <case id>: <value> (` has it, except that a value holding `;` is put in double quotes and a `|` is written `\|` (the report keeps the raw value, never quoted or escaped); until it is recorded, write `observed: pending <what to observe>` with no report, which the check refuses. A case the explorer could not reach, which the person chose to observe at the expert's first run, says `observed: at first run <what to observe>`; the check accepts it only once the contract has its approval line, and the expert's amendment `A-n first-run values: <case id> = <value> (<report>)` must be approved before that value counts. A JSON string value is written without its JSON quotes. One row per case. -->

## Observed only

- <id> <what it shows>: characterization

<!-- List every case whose oracle is only `observed:`. Mark each `confirmed by <who>` (a person confirmed at approval that the observed behaviour is intended) or `characterization` (the test is written and named as a characterization test). Leave the section out when no case is observed-only. -->

## Stand needs

- Profile: <stand profile>
- Modules: <required modules, with the minimum version the cases rely on>
- Data roles: <roles from the facts>

## Building blocks

- Reuse: <existing documents, generated types, page objects, arrange methods, builders, dataset records>
- Add: <what must be created, in dependency order>

## Platform defects

- <case id>: <the defect, in one line>; <tracker link, or no ticket yet>

<!-- One line per case whose correct behaviour the platform is known to break, or the single line `None`. The test
asserts the correct behaviour and is marked as a known issue (`framework-rules`, Platform Defects); a tracker link
becomes its `issue` annotation. Never a skip or a workaround. -->

## Verification

- <the typecheck, lint (when the facts have one) and test commands from the facts, then the commands that run the new specs>

<!-- Cases that change state on an account other specs of the suite also use run with `--workers=1`, in a series that includes those neighbouring specs: write the flag in the command here (`framework-rules`, Shared Accounts). `reconcile-run` compares the run with the flags written here. -->

<!-- ## Approval
Left out until a person approves. Written only by that person, or by the session they answered, quoting their reply word
for word; never by an agent. One line, the bracket only when relayed:

Approved: <who>, <YYYY-MM-DD> (relayed: "<the person's exact words, several lines joined with / >")
-->

<!-- ## Amendments
Written only by the implementer when the contract turns out to be wrong. It stops and waits; a person approves, and the
approval line is written as under Approval.

### A-1 <what changes>

Cases: <the case ids it touches>
Changes: <the assertion, oracle or building block that changes, from and to>
Drops: <case ids no test will cover, only when it drops a case>

<why>

Approved: <who>, <YYYY-MM-DD>
-->
