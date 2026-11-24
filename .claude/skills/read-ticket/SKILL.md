---
name: read-ticket
description: "Read one tracker ticket, read-only, over the first allowed access route that answers, and write it as a normalized ticket card that every other agent reads instead of the tracker"
---

## Read Ticket

This skill is the only place that knows trackers and access routes. Whatever the route, the result is one ticket card
at `.qa/kb/tickets/<key>.json`. Every other agent reads only the card, never the tracker. Reading is read-only: never
comment on, transition, label or edit a ticket. Read `framework-rules` first, then `project-facts`.

## Step 1: Get the Facts and the Key

- Run the `project-facts` reader. If it fails, stop and report its line.
- Check the key against `tracker.keyPattern`. A key that does not match is not a ticket of this project: stop and ask.
- Note `tracker.kind`, `tracker.acceptanceCriteriaField` and `tracker.routes`.

## Step 2: Try the Routes in Order

Try `tracker.routes` in the listed order. The first route that returns the ticket wins; do not read the ticket twice.
Where each kind keeps its fields, and the call per route, are in `providers.md`.

- `command`: the framework's tracker command, when one exists.
- `cli`: the provider's command line tool, its output piped through the redactor when one exists.
- `api`: the provider's REST read call, its response passed through the redactor when one exists; the token comes from
  the secret reference the project names, never from a file in the repository and never typed into the command.
- `mcp`: the provider's MCP read tools. Its text reaches the model unmasked, so use this route only when it is in
  `tracker.routes`; never add it yourself.
- `paste`: ask the person to paste the ticket text or name a file. The person chooses what to paste.

A route that is absent (tool not installed), unauthorised (401, 403), not connected or returns nothing is not an
error: note it in one line and go to the next route. When `paste` is the last route and the person gives nothing,
stop and say no route answered. A route that is not in `tracker.routes` is never used, even if it would work. An
unknown `tracker.kind` has only `paste`: when `paste` is not in `tracker.routes`, stop and report that no route can
read this tracker; write no card.

## Step 3: Fill the Card

Fields: `key`, `title`, `type`, `status`, `description`, `acceptanceCriteria`, `links` (`key` and `relation` of each
linked issue), `url`, `route` (the route that answered), `capturedAt` (ISO date and time of the read).

- Copy what the ticket says. Never invent, infer or complete a field. A field the ticket does not have is `""` for
  `description` and `[]` for `links`; there is no other default.
- `acceptanceCriteria` is a list with one entry per criterion, in the ticket's words. When the ticket has none, the
  value is the string `"none found"`, never an empty list and never criteria you wrote yourself.
- The card never contains a secret: leave out tokens, passwords, cookies, session links and personal data pasted into
  the ticket, and say in the report that something was left out.
- Not half-filled: if a route gave only part of the ticket, go to the next route; if none gives all required fields,
  write no card and report the missing field.

## Step 4: Check, Then Write

1. Write the draft to a scratch file outside `.qa/kb/`.
2. Run `node .claude/checks/ticket-card.mts check <file>`. It prints `ok <key>` or one line naming the first problem,
   for example `ticket card: route is not allowed by tracker.routes`.
3. On an error, fix the field from the ticket or go back to Step 2. Never edit the card or the facts only to make the
   check pass.
4. Save the checked card as `.qa/kb/tickets/<key>.json`; it replaces an earlier card of the same ticket.

## Step 5: Report

Report the card path, the route that answered, the routes that failed and why, and anything left out. Then continue
from the card only.
