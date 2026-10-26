---
'eddy-code': patch
---

More credential files are now treated as sensitive: `.netrc`, `.git-credentials`, `.pypirc`, `~/.npmrc`, `.kube/config`, `.docker/config.json`, Eddy Code's own `config.toml`, and everything under `.ssh/` and `.gnupg/` except public keys. A project's own `.npmrc` stays readable.
