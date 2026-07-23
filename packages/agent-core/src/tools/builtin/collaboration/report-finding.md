Report a code review finding. Use this tool for each issue found during a review. Call it once per finding, then call yield when done.

Use this tool only when acting as a reviewer agent. Do not use it when writing or editing code.

Each finding must be evidence-backed and anchored to the patch under review.

Priority levels:
- P0: Blocks release/operations; universal (no input assumptions). Example: data corruption, auth bypass.
- P1: High; fix next cycle. Example: race condition under load.
- P2: Medium; fix eventually. Example: edge case mishandling.
- P3: Info; nice to have. Example: suboptimal but correct.

Criteria before reporting:
- Provable impact: show specific affected code paths, no speculation.
- Actionable: discrete fix, not vague "consider improving X".
- Unintentional: clearly not a deliberate design choice.
- Introduced in patch: do not flag pre-existing bugs unless asked.
- No unstated assumptions: bug does not rely on assumptions about codebase or author intent.
- Proportionate rigor: fix does not demand rigor absent elsewhere in codebase.

Example:
```json
{
  "title": "Validate input length before buffer copy",
  "body": "When data.length > BUFFER_SIZE, memcpy writes past buffer boundary. Occurs if API returns oversized payloads, causing heap corruption.",
  "priority": "P0",
  "confidence": 0.95,
  "file_path": "src/buffer.c",
  "line_start": 42,
  "line_end": 44
}
```
