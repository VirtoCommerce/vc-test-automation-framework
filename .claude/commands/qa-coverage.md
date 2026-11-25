# QA Coverage

Spawn the `qa-coverage` agent once to list what the stand offers, what the tests cover, and rank the gaps. It is
read-only and writes only a local report under `.qa/reports/`.

`$ARGUMENTS` optionally limits the scope to a module, a page or an API area. No arguments: the whole stand.

Dispatch the agent fresh with the scope and nothing else. Show the report path, the ranked gaps with their ids, and
the metrics. Do not plan anything; end with:
```
Report: .qa/reports/<file>
Next: /qa-plan <gap id> to plan tests for a gap.
```
