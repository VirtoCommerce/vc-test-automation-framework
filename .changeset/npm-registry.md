---
"@virtocommerce/test-automation-framework": minor
---

The package is published to the public npm registry, npmjs.org, instead of GitHub Packages, with an npm provenance
attestation. Installing it no longer needs a token.

Migration: remove the `@virtocommerce:registry` and `//npm.pkg.github.com/:_authToken` lines from your `.npmrc`, and
the `GITHUB_PACKAGES_TOKEN` variable from your CI, then run `npm install` to point `package-lock.json` at npmjs.org.
