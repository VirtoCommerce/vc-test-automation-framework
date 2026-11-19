---
name: project-facts
description: "Read the facts of the repository the agents work in (tracker, doc sources, commands, roles, critical flows, weights, autonomy) from .qa/project.json through one command, and stop when it fails"
---

## Project Facts

Everything that differs between repositories lives in `.qa/project.json`: the tracker and the ways to read it, the
documentation sources, the typecheck, lint and test commands, the data roles, the critical flows, the coverage
weights, the flaky-run series and what an agent may apply on its own. Agents never carry these values in their
prompts.

## Step 1: Run the Reader First

```shell
node qa/project-facts.mts
```

It prints the validated JSON. It prints one line and exits with 1 when the file is missing, is not valid JSON or has
a missing or invalid field, for example `project.json: commands.typecheck is missing`.

## Step 2: Stop When It Fails

- Report the error line as it is and name the file to fix. Do not continue.
- Never fall back to values from another repository, from an earlier run or from memory. A guessed command or role
  runs against the wrong stand.
- Never edit `.qa/project.json` to make the reader pass. Ask the person who owns the repository.

## Step 3: Read Only From Its Output

- Roles: `roles["<role name>"]` is the account to pass to `test.use({ user })`. Name roles in plans and reports, not
  accounts.
- Commands: `commands.typecheck`, `commands.lint` and `commands.test["<project>"]`. Run these exactly; do not rebuild
  them from `package.json`.
- Critical flows: `critical`. An empty list means none are declared; do not invent any.
- Knowledge snapshot: `knowledgeDir` is the directory where the knowledge snapshot lives; read it before calling a live
  service.
- Tracker: `tracker.keyPattern` validates a ticket key; `tracker.routes` is the order in which to try to read a ticket,
  ending with pasted text.
- Quality gates: `quality` holds the shape limits (`maxSteps`, `maxLines`, `maxExpects`, `maxNesting`, `maxConditionals`),
  `stableSeries` (the repetitions of a new or changed test, apart from `flakyRunSeries`), `durationBudgetMs` per project
  and `slowdownRatio`. Read them; never judge a test by limits of your own.
- Autonomy: `autonomy["<area>"]`, else `autonomy["*"]`, which the reader requires. `propose` means write the change
  into the report and wait; `apply` means do it.
- Healer paths: `healerPaths` lists the directories the healer may change (page objects, data). Everything else,
  specs included, is off limits to it. Each is a plain relative directory (`pages/`); the reader refuses the
  repository root, a leading `/` or `\`, a drive or UNC path, `..`, an 8.3 short name (`~1`) and any segment that
  starts with `.git` or `.qa` or is `qa`, `node_modules` or `.claude`.
