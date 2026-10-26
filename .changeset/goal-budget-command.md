---
'eddy-code': patch
---

Add `/goal budget` to set a stop condition for the current goal from the TUI: `/goal budget tokens 5m`, `/goal budget turns 100`, or `/goal budget time 30m`. It works while the goal is running; after a goal stops on its budget, raise the budget and run `/goal resume`.
