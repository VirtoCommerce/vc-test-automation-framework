---
name: judge-criteria
description: "The criteria the judge answers pass or fail on, one file per role (planner, expert, explorer, healer, coverage), and the shape of the verdict file it writes"
---

## Judge Criteria

One file per role holds that role's criteria and nothing else is a source for them: `planner.md`, `expert.md`,
`explorer.md`, `healer.md`, `coverage.md`. In a flow the judge reads `expert.md` only; the other files serve the
evaluation suite.

## Step 1: Read Your Role's File

Read the one file for the role you were given. Every `- \`name\`` line is a criterion; answer each, by that exact
name, and answer no other.

## Step 2: Answer Each Criterion From Evidence

- `pass` is true only when you have shown the criterion holds, from the output under judgement and what the
  repository, the stand's read-only records or a command's output tell you. Say where: file and line, command and
  its line of output.
- Never use the agent's own summary or reasoning as evidence. If you were handed one, ignore it.
- When the evidence is missing, thin or points both ways, `pass` is false and the evidence says what is missing.

## Step 3: Write the Verdict File

Write `.qa/judge/<contract-or-slug>/judge-<role>.json`, nowhere else:

```json
{
  "role": "expert",
  "subject": "<the contract path, or the files judged>",
  "criteria": [{ "name": "<criterion>", "pass": false, "evidence": "<what you saw, where>" }],
  "verdict": "fail"
}
```

`verdict` is `pass` only when every criterion passes, and `fail` otherwise. Then run
`node qa/judge-verdict.mts check <file>`; it must print `ok`. Fix the file, not the criteria, until it does.
