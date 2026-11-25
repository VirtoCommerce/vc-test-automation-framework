---
"@virtocommerce/test-automation-framework": patch
---

`npx vc-qa-agents` appends the missing entries for the agents' working files to `.gitignore` instead of listing them,
and `node .claude/checks/project-facts.mts` fails while `.qa/project.json` still holds an example value: a role account
on `your-company.test` or a tracker key pattern of the project `PROJ`.
