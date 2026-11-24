---
name: explore-api
description: "Map an area of an API on the stand: the operations the schema declares, and what the page's own traffic shows the live service answering, with every difference. Read-only; sends no request of its own; writes only the report under .qa/reports/"
argument-hint: "<api-area>"
---

## Explore API

Used by `qa-explorer`. The result is the two API sections of `.qa/reports/explore-<slug>.md`. It writes no
request code, no query and no test. Read first: the skill `framework-rules`, then `project-facts`
(`node .claude/checks/project-facts.mts`).

## Step 1: The Schema

- Find the schema the repository holds for the area: a generated schema file, an OpenAPI document, or the operations the
  existing specs and `arrange` methods call (Grep, Glob). Read the knowledge snapshot (`knowledgeDir`) too.
- No schema in the repository: the live service is the only source, and the report says so.

## Step 2: Operations

For each operation of the area, one row:

| Operation | Kind | Arguments | Returns | Used by |
|---|---|---|---|---|

`Kind` is query, mutation, GET, POST and so on; `Used by` is the existing spec or `arrange` method that calls it, or
`none`.
List a mutation and any state-changing request here, but never call one.

## Step 3: Schema vs Live

Your only live source is what the page itself sends: open the pages of the area with the browser (the stand's origins:
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

The explorer's `observe` mode records the value one case asserts. First confirm who is signed in, from the page (the
account menu) or from the page's own answer that names the current user: it must be `roles[<the case's data role>]`, or
no account for `none`. Any other account, or none you can confirm: write `not reached: needs <role>`. Then take the
value from the answer of the request the page sent for that case (`browser_network_request`, `part: "response-body"`)
and write it raw, never quoted or escaped: a JSON string value without its JSON quotes. A value no request of the page
shows is `not reached: no page sends it`.

## Done

The two sections are in the report, each with its rows or `none observed`, and every row says where it was seen:
schema file, existing spec or `arrange` method, or the page's traffic. Nothing outside `.qa/reports/` changed
(`git status`), and you sent no request of your own.

## Example from this repository

- GraphQL: schema `virtocommerce/graphql/generated/schema.graphql`, operations in `virtocommerce/graphql/operations/`,
  endpoint `/graphql` on the backend host.
- REST: types generated from the platform's API in `virtocommerce/rest/generated/platform.ts`; specs and
  `virtocommerce/arrange/` call the endpoints directly by path.
