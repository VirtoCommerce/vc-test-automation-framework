---
"@virtocommerce/test-automation-framework": patch
---

`npx vc-qa-agents` appends the missing entries for the agents' working files to `.gitignore`, in the file's own line
endings, instead of listing them. Any argument the usage does not list now fails with the
usage instead of running the install, so a typo no longer installs silently.
