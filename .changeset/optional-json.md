---
"@virtocommerce/test-automation-framework": minor
---

Add `HttpResponse.optionalJson()`, which returns the parsed body, or `undefined` when the body is empty or `null`.
`optionalJson` and `parseOptional` take `{ allow404: true }` for endpoints that answer a missing record with a 404
status.
