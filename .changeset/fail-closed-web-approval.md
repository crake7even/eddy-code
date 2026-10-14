---
'eddy-code': patch
---

When a tool call needs approval but no approval channel is available, the call is now blocked instead of silently approved. In the default (manual) permission mode, `FetchURL`, `WebSearch` and `MakeSkillApply` now ask before running instead of being approved automatically. Approving `FetchURL` for the session covers the same website only; approving `WebSearch` for the session covers all searches.
