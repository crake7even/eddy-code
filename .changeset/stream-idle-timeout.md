---
'eddy-code': patch
---

Stop waiting forever on a stalled model stream: if the provider sends no data for 120 seconds, the request now fails with a retryable timeout and is retried automatically instead of leaving the session spinning.
