# Contract: <ticket key, or area name> <short title>

<!-- Save as .qa/contracts/<ticket-key-or-slug>.md. Delete every comment before the check. -->

## Source

ticket: <key>

<!-- The first line is one of: `ticket: <key>`, `doc: <link or page>`, `area: <name>`, `gap: <gap id from the coverage report>`. Extra lines: the card path, the documentation pages, the explorer report. -->

## Scope

- <behaviour under test, one line each, in the words of the criterion or the documented rule>

## Out of scope

- <what is not tested and why: another ticket, covered by an existing spec, needs a module the stand lacks>

## Cases

| Case | Technique | Project | Data role | Oracle |
|---|---|---|---|---|
| <id> <what it shows> | <equivalence partitioning, boundary value analysis, decision table, state transition, pairwise, error guessing, negative, regression> | <a key of commands.test in the facts> | <a role from the facts> | ticket: <criterion> |

<!-- A case without an account says `none` in Data role; several roles are separated by commas. Every Oracle cell starts with the source of the expected value: `ticket:`, `doc:`, `schema:` or `observed:`. Several sources are separated by `;`, each starting with its own prefix. An `observed:` part holds the value the explorer recorded and the report it is in, `observed: <value> (.qa/reports/explore-<slug>-observed.md)`, the value written as the report's line `- <case id>: <value> (` has it, except that a value holding `;` is put in double quotes and a `|` is written `\|` (the report keeps the raw value, never quoted or escaped); until it is recorded, write `observed: pending <what to observe>` with no report, which the check refuses. A case the explorer could not reach, which the person chose to observe at the expert's first run, says `observed: at first run <what to observe>`; the check accepts it only once the contract has its approval line, and the expert's amendment `A-n first-run values: <case id> = <value> (<report>)` must be approved before that value counts. A JSON string value is written without its JSON quotes. One row per case. -->

## Observed only

- <id> <what it shows>: characterization

<!-- List every case whose oracle is only `observed:`. Mark each `confirmed by <who>` (a person confirmed at approval that the observed behaviour is intended) or `characterization` (the test is written and named as a characterization test). Leave the section out when no case is observed-only. -->

## Stand needs

- Profile: <stand profile>
- Modules and flags: <required modules, feature flags>
- Data roles: <roles from the facts>

## Building blocks

- Reuse: <existing clients, documents, page objects, arrange methods, dataset records>
- Add: <what must be created, in dependency order>

## Known issues

- <entry name and issue link, or None>

## Verification

- <the typecheck, lint and test commands from the facts, then the commands that run the new specs>

<!-- ## Approval
Left out until a person approves. Written only by that person, or by the session they answered, quoting their reply word for word; never by an agent. One line, the bracket only when relayed:

Approved: <who>, <YYYY-MM-DD> (relayed: "<the person's exact words, several lines joined with / >")
-->

<!-- ## Amendments
Written only by the implementer when the contract turns out to be wrong. It stops and waits; a person approves, and the approval line is written as under Approval.

### A-1 <what changes>

<why, and the change>

Approved: <who>, <YYYY-MM-DD>
-->
