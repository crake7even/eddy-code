---
'eddy-code': patch
---

Stop re-posting global user instructions after every user message: they are re-injected only when the rules file changes or every few real user prompts as a refresher, since the system prompt already carries them.
