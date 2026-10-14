---
'eddy-code': patch
---

Auto permission mode no longer silently approves risky file access: reading or writing sensitive files (`.env`, SSH keys, credentials), writing into `.git` control paths, and writing outside the working directory are now denied, since auto mode has nobody to ask. Reads elsewhere stay approved.
