# Empty Stop Retry

The assistant turn ended without producing any content or tool calls. This is not a valid completion.

Retry by:
1. Checking the most recent tool result or user message.
2. Determining the next concrete action.
3. Either calling a tool or providing a substantive text response.

Do not end the turn with an empty message.
