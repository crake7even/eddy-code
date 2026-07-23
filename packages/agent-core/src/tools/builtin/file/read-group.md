Read multiple files in parallel.

Use this when you need to inspect several files in the same step. It performs the same path-access checks and file-type validation as Read, but batches the calls into one tool invocation.

Inputs:
- paths: array of file paths (max 10). Relative paths resolve against the working directory.
- line_offset: optional starting line number (1-based; negative values read from the end).
- n_lines: optional maximum lines per file.

Output:
A single aggregated string with each file's contents separated by a header line. If a file fails, the error is included inline and the rest continue.

Use Read (single file) when only one file is needed; use ReadGroup when you want 2-10 files at once.
