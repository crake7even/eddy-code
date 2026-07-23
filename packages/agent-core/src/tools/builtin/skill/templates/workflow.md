# Skill type: workflow

Focus on the sequence of actions that led to a successful outcome in the conversation. Extract a reusable, step-by-step workflow that can be applied to similar future tasks.

The generated skill should include:
1. A brief statement of the problem/opportunity this workflow addresses.
2. Preconditions or trigger conditions for invoking the workflow.
3. Numbered execution steps. Each step should be concrete and mention the primary tool(s) to use (e.g. Read, Glob, Bash, Agent).
4. Decision points where the assistant should ask the user or branch based on findings.
5. One realistic example of how a user would invoke the new skill.
6. A short "quality gate" checklist (what to verify before finishing).

Avoid project-specific file names unless they are truly universal; prefer patterns like `<source-dir>` or `<entry-file>`.
