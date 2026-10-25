import type { Agent } from '../..';
import { classifyShellCommandRisk } from '../../../tools/policies/shell-risk';
import type { PermissionPolicy, PermissionPolicyContext, PermissionPolicyResult } from '../types';

/**
 * Auto mode approves every Bash command with nobody to ask, so commands that
 * look like credential exfiltration or irreversible damage become hard denies.
 */
export class AutoModeShellCommandDenyPermissionPolicy implements PermissionPolicy {
  readonly name = 'auto-mode-shell-command-deny';

  constructor(private readonly agent: Agent) {}

  evaluate(context: PermissionPolicyContext): PermissionPolicyResult | undefined {
    if (this.agent.permission.mode !== 'auto') return;
    if (context.toolCall.name !== 'Bash') return;
    const args = context.args as { command?: unknown } | undefined;
    if (typeof args?.command !== 'string') return;

    const risk = classifyShellCommandRisk(args.command);
    if (risk === undefined) return;
    return {
      kind: 'deny',
      reason: { shell_risk: risk.category, shell_risk_detail: risk.detail },
      message:
        `This command is not allowed in auto permission mode (${risk.detail}). ` +
        'Auto permission mode runs without user interaction, so risky shell commands are blocked. ' +
        'Continue without it, or tell the user what needs to be done manually.',
    };
  }
}
