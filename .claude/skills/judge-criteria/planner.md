# Criteria: the planner's contract

Judged from the contract file and its source (the ticket card, the document or the area), never from the planner's
reasoning.

- `requirements-covered`: every acceptance criterion or documented rule of the source became a case row or an
  out-of-scope line with a reason. List each requirement with the row or line that holds it.
- `oracle-source-named`: every case's oracle names where its expected value comes from (`ticket`, `doc`, `schema`
  or `observed`), and the named source says what the case expects. An `observed` oracle is listed for confirmation.
- `nothing-invented`: no case, rule or expected value is absent from the source, the schemas and what the explorer
  observed. Quote the source of any doubtful row.
