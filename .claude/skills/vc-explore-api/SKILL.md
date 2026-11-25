---
name: vc-explore-api
description: "Map an area of an API on the stand: the operations the schema declares, and what the page's own traffic shows the live service answering, with every difference; with no page, the schema and anonymous reads. Read-only; sends no request of its own but the two sanctioned checks; writes only the report under .qa/reports/ and probe files under .qa/probes/"
argument-hint: "<api-area>"
---

## Explore API

Used by `vc-qa-explorer`. The result is the two API sections of `.qa/reports/explore-<slug>.md`. It writes no
request code, no query and no test. Read first: the skill `vc-framework-rules`, then `vc-project-facts`
(`node .claude/checks/project-facts.mts`). Before the first step run `git status --short` and keep its output: Done
compares with it.

## Step 1: The Schema

- Find the schema the repository holds for the area: a generated schema file, an OpenAPI document, or the operations the
  existing specs and `arrange` methods call (Grep, Glob). Read the knowledge snapshot (`knowledgeDir`) too.
- No schema in the repository and none in `knowledgeDir` (`schema-graphql.graphql`, `schema-rest.txt`): run
  `node .claude/checks/introspect.mts graphql`, and `rest` for a REST area. It asks the stand's backend for its schema
  without a credential, saves it in `knowledgeDir` with the capture date (`schema-rest.txt` holds one operation per
  line, to search with Grep) and prints only counts. An answer other than 200 is `not reached: the backend describes
  its schema only to a signed-in user`, not a stop.
- Still none: the live service is the only source, and the report says so.

## Step 2: Operations

For each operation of the area, one row:

| Operation | Kind | Arguments | Returns | Used by |
|---|---|---|---|---|

`Kind` is query, mutation, GET, POST and so on; `Used by` is the existing spec or `arrange` method that calls it, or
`none`.
List a mutation and any state-changing request here, but never call one.

## Step 3: Schema vs Live

Your only live source is what the page itself sends. With no browser (no `playwright` tools, or no page of the area),
write `not reached: no browser session of the stand` here, keep Step 2 from the schema and go on; never stop for it.
Otherwise open the pages of the area with the browser (the stand's origins:
`node .claude/checks/stand.mts`) and read the requests and answers with `browser_network_requests`; read one answer's
body with `browser_network_request`, passing only its `index` and `part: "response-body"` (the hook refuses any other
form). Never open the body of a sign-in, token or refresh request (`/connect/token`, an `auth` or `login` path): it
holds credentials. Never copy personal data from a body into a report. You send no request of your own: no `fetch`, no
script, no call from the shell.

- Take the operation, its arguments and the answer's shape from the requests the page made. Use the session the
  browser already has. Do not type or look up credentials. A request that answered 401 or 403 is recorded as
  `not reached: needs <role>`; it is not a difference.
- Keep no response body in the report beyond the field names and types, except, when observing for a contract, the
  values its cases assert; never copy personal data or a secret.

Compare each observed answer with the schema and list every difference, one row each: the operation, the field or
status, what the schema says, what the page's traffic showed. Differences to look for: a field the schema declares but
the answer does not return; a field the answer returns that the schema lacks; a nullable field that is never null, or
the other way; a type, enum value or error shape that does not match; an operation the page sends that the schema
does not declare.

An operation the page did not send is listed as `not seen: <why>` (the page never uses it, it changes state, it
needs a role). Never trigger one to see it.

## Observing for a Contract

The explorer's `observe` mode records the value one case asserts, in `.qa/reports/explore-<slug>-observed.md`. First
confirm who is signed in, from the page (the account menu) or from the page's own answer that names the current user:
it must be `roles[<the case's data role>]`, or no account for `none`. Any other account, or none you can confirm:
write `not reached: needs <role>`. Then take the value from the answer of the request the page sent for that case
(`browser_network_request`, `part: "response-body"`) and write it raw, never quoted or escaped: a JSON string value
without its JSON quotes.

No page sends it: only for data role `none`, read it with the probe. Write `.qa/probes/<slug>.graphql` (one
`query`, never a mutation) or `.qa/probes/<slug>.get` (one line, the path and query to GET), and run
`node .claude/checks/probe.mts <that file>`. It sends the request anonymously, read-only, and prints the status and the
answer (a credential-shaped answer is not shown). Take the value from that answer, `(<where seen>)` being the probe
file. A 401 or 403 is `not reached: needs <role>`; no probe can sign in. A value nothing can show is
`not reached: no page sends it`.

## Done

The two sections are in the report, each with its rows, `none observed` (looked, found nothing) or `not reached: <why>`
(could not look: a role, a request the page never sends), and every row says where it was seen:
schema file, existing spec or `arrange` method, or the page's traffic. Nothing outside `.qa/reports/` changed: `git status --short` now shows what the one you took before your first write
showed (the repository may already hold untracked or changed files, or not be under git: then say that it could not be
compared), and you sent no request of your own but the sanctioned `introspect` and `probe` checks.

## Example from this repository

The framework's own suite, as an example and not a rule; another repository's values come from its facts and files.

- GraphQL: schema `virtocommerce/graphql/generated/schema.graphql`, operations in `virtocommerce/graphql/operations/`,
  endpoint `/graphql` on the backend host.
- REST: types generated from the platform's API in `virtocommerce/rest/generated/platform.ts`; specs and
  `virtocommerce/arrange/` call the endpoints directly by path.
