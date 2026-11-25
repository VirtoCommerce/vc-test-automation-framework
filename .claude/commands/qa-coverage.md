# QA Coverage

Spawn the `qa-coverage` agent once to list what the stand offers, what the tests cover, and rank the gaps. It is
read-only and writes only a local report under `.qa/reports/`.

`$ARGUMENTS` optionally limits the scope to a module, a page or an API area. No arguments: the whole stand.

First run `node .claude/checks/prune.mts --fetch --yes`, which removes only finished work under `.qa/` (a contract
whose cases are all in test titles on the default branch, with its run record, verdict and observed report), and keep
its last line (`prune: …`). Show its `ask` lines to the person as one list; only on their yes run
`node .claude/checks/prune.mts --yes --include-stale`. The coverage run does not wait for that answer, and a
`not reached` line or a failed check never stops it.

Dispatch the agent fresh with the scope and nothing else. Show the report path, the ranked gaps with their ids, and
the metrics. Do not plan anything; end with:
```
<the prune: line>
Report: .qa/reports/<file>
Next: /qa-plan <gap id> to plan tests for a gap.
```
