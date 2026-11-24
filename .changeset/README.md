# Changesets

Every pull request that changes what consumers of the package get adds a changeset:

    npm run changeset

Pick the bump and describe the change for consumers, not for reviewers:

- `patch`: a fix; nothing to change on their side.
- `minor`: something new; existing code keeps working.
- `major`: existing code must change. Add a "Migration" paragraph saying how.

While the version is `0.x`, a breaking change is a `minor` bump.

A pull request with nothing for consumers (docs, CI, internal tests) adds an empty one:

    npx changeset --empty
