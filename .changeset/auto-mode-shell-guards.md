---
'eddy-code': patch
---

Auto permission mode no longer approves every Bash command: commands that read credentials or dump the environment, send data over the network (`curl -d`, `nc`, `scp`, …), pipe into a shell, run `sudo`, or destroy data (`rm -rf` outside the project, `git push --force`, `git reset --hard`) are now denied. Web fetches also follow redirects hop by hop and refuse hosts that resolve to private addresses.
