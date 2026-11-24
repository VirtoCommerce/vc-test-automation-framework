# Guard Recipe

The dispatcher's check after a heal: `/qa` (stage Heal) and `/qa-heal` (step 2) store this file from the baseline
with `git cat-file blob` before dispatching the healer, never read it from the working tree after the heal, and run
the stored copy word for word. It is never the
healer's: the healer may not run `--repo-fingerprint`, and its own early check is step 7 of `SKILL.md`.

## Run the Guard

Recompute the fingerprint and run the guard, both from the baseline's own copy of `.claude/checks/`, never from the
working tree (the healer could have changed it), so only the healer's changes are judged. Take that copy with
`git cat-file blob`, which applies no attributes, filters or hooks, and never with `git archive` or a checkout, which
run a smudge filter a planted `.git/info/attributes` or a global attributes file names; `--no-replace-objects` and
`GIT_NO_LAZY_FETCH=1` keep a replace ref or a partial clone's fetch from changing what it reads. The fingerprint comes before
any git command that can run configured code:

```shell
dir=$(mktemp -d) && mkdir "$dir/checks" || exit 1
for m in expectation-guard project-facts; do GIT_NO_LAZY_FETCH=1 git --no-replace-objects -c core.fsmonitor=false cat-file blob <baseline tree id>:.claude/checks/$m.mts > "$dir/checks/$m.mts" || { rm -rf "$dir"; exit 1; }; done
fp=$(node "$dir/checks/expectation-guard.mts" --repo-fingerprint 2>"$dir/fp.err") && [ ${#fp} -eq 64 ] && case $fp in *[!0-9a-f]*) false;; esac || { err=$(grep -m1 '^expectation-guard:' "$dir/fp.err" || tail -n 1 "$dir/fp.err"); echo "fingerprint could not be computed: ${err:-not 64 lowercase hex characters}"; rm -rf "$dir"; exit 1; }
test "$fp" = "<fingerprint>" || { echo "repository config changed by the healer"; rm -rf "$dir"; exit 1; }
node "$dir/checks/expectation-guard.mts" --base=<baseline tree id>; code=$?
test $code -eq 0 && { new=$(node "$dir/checks/expectation-guard.mts" --snapshot) || code=1; }; rm -rf "$dir"; test $code -eq 0 && echo "healed tree: $new"; test $code -eq 0
```

On a clean guard the last line prints `healed tree: <new tree id>`, the working tree right after the guard, taken
with the baseline's copy of the guard.

## What the Outcome Means

"repository config changed by the healer" (the fingerprint differs from the recorded one) or "fingerprint could not
be computed: <its stderr line>" (it exited non-zero or printed something other than 64 lowercase hex characters, a
configuration file under a healer path for one; the line is the guard's `expectation-guard:` line, else the last
line of its stderr, so a Node warning is not taken for it): stop there, show the line to the person, and run no other git
command or test in the repository until they have looked; a planted hook or config line runs with their rights. Any other non-zero
result means "not clean" (the recipe exits 1 whatever the guard's own code, so a baseline without the two
`.claude/checks/` files also gives it). Findings listed (a file outside the healer paths, which are directories of the
suite such as `virtocommerce/pages/`, a changed expectation, an added skip, wait or similar): stop, show them to the
person, and go on to neither the judge nor a review. No finding listed: the guard could not run; report "not
checked", never clean, and go on to neither the judge nor a review.

## After a Clean Guard

When the heal belongs to a contract's run record:

After a clean guard, re-run the definition of done's commands yourself (a mechanical re-run, not a role's work), so
that the reviewer reconciles the healed state and not the expert's red record: for each project of the contract's
case rows, with the expert's spec files, the stable series and the list into the same `report.<project>.json` and
`list.<project>.json`, then reconcile ("Hand-off Paths", all three commands, the listing with
`--config=<suiteDir>` from the facts, such as `npx --no -- playwright test --config=virtocommerce --list ...`).
The expert's spec files are the ones that record's `list.<project>.json` files name; those name them relative to the
suite directory (`tests/restapi/...`), so pass them as `<suiteDir>/<path>` (`virtocommerce/tests/restapi/...`). Exit 1
on a project (a stand that is not reachable included): the run is not done; show the reconcile lines to the person.
