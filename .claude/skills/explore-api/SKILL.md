---
name: explore-api
description: "Map an area of an API on the stand: the operations the schema declares, and what the live service answers to read-only calls, with every difference. Read-only; never calls an operation that changes state; writes only the report under .qa/reports/"
argument-hint: "<api-area>"
---

## Explore API

Used by `qa-explorer`. The result is the two API sections of `.qa/reports/explore-<slug>.md`. It writes no client,
no query and no test. Read first: the skill `framework-rules`, then `project-facts`
(`node qa/project-facts.mts`).

## Step 1: The Schema

- Find the schema the repository holds for the area: a generated schema file, an OpenAPI document, or the
  operations the existing clients and specs call (Grep, Glob). Read the knowledge snapshot (`knowledgeDir`) too.
- No schema in the repository: the live service is the only source, and the report says so.

## Step 2: Operations

For each operation of the area, one row:

| Operation | Kind | Arguments | Returns | Used by |
|---|---|---|---|---|

`Kind` is query, mutation, GET, POST and so on; `Used by` is the existing client or spec that calls it, or `none`.
List a mutation and any state-changing request here, but never call one.

## Step 3: Schema vs Live

Ask the live service only for what reads:

- Only GraphQL `query` operations (and introspection), REST `GET` and `HEAD`, through the browser's own request
  (`browser_evaluate` with `fetch`, or the requests the page itself made, read from `browser_network_requests`).
  No mutation, no `POST`, `PUT`, `PATCH` or `DELETE` that writes, no bulk or export call, no call that sends a
  message or starts a job.
- Use the session the browser already has. Do not type or look up credentials. An operation that answers 401 or 403
  is recorded as `not reached: needs <role>`; it is not a difference.
- Ask for the smallest page of data that shows the shape: a first page, a single id. Keep no response body in the
  report beyond the field names and types; never copy personal data or a secret.

Compare each answer with the schema and list every difference, one row each: the operation, the field or status,
what the schema says, what the service answered. Differences to look for: a field the schema declares but the
service does not return; a field the service returns that the schema lacks; a nullable field that is never null, or
the other way; a type, enum value or error shape that does not match; an operation the schema declares that the
service does not know; an operation the service answers that the schema does not declare.

An operation not called is listed as `not called: <why>` (changes state, needs a role, no safe id to ask for).

## Done

The two sections are in the report, each with its rows or `none observed`, and every row says where it was seen:
schema file, existing client, or a live read-only call. Nothing outside `.qa/reports/` changed (`git status`), and
no request that changes state was sent.

## Example from this repository

- GraphQL: schema `api/graphql/generated/schema.graphql`, endpoint `/graphql` on the backend host.
- REST: clients under `api/rest/`.
