---
'eddy-code': patch
---

Fix the transcript being duplicated in terminal scrollback. Full redraws (resize, theme switch, approval preview, off-screen updates) now repaint only the viewport instead of re-printing the whole history; resuming a session replays its history once into a cleared scrollback. The welcome panel's "recent sessions" times no longer tick and trigger redraws.
