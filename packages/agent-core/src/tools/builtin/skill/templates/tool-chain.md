# Skill type: tool-chain

Focus on a reusable combination of tools that solved the task efficiently. The skill should read like a "recipe" for invoking the right tools in the right order.

The generated skill should include:
1. The class of task this chain handles.
2. The trigger question or user request that indicates this chain should be used.
3. The ordered tool calls, with representative arguments or placeholders.
4. How to pass results from one tool to the next.
5. Expected output at the end of the chain.
6. When to stop and ask the user for clarification.

Prefer generic placeholders over literal paths, but keep argument structure accurate.
