# Criteria: the coverage report

Judged from the report, the tests in the repository and the weights in the project facts, never from the coverage
agent's reasoning.

- `each-gap-is-real`: no existing test covers the behaviour each listed gap names. Search the tests for each gap
  and quote the result.
- `order-follows-weights`: the order of the gaps follows the weights in the project facts, as the ranking script
  computes it, not the agent's preference.
