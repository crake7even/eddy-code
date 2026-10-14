import type { Agent } from '../..';
import type { PermissionPolicy, PermissionPolicyContext, PermissionPolicyResult } from '../types';
import {
  CwdOutsideFileWriteAskPermissionPolicy,
  GitControlPathAccessAskPermissionPolicy,
  SensitiveFileAccessAskPermissionPolicy,
  writeFileAccesses,
} from './file-access-ask';

const AUTO_MODE_DENY_HINT =
  'Auto permission mode runs without user interaction, so this file access is blocked. ' +
  'Continue without it, or tell the user what needs to be done manually.';

/**
 * Auto mode approves everything with nobody to ask, so the file checks that
 * would ask in other modes become hard denies: sensitive files, writes into
 * git control paths, and writes outside the cwd.
 */
export class AutoModeFileAccessDenyPermissionPolicy implements PermissionPolicy {
  readonly name = 'auto-mode-file-access-deny';
  private readonly sensitive: SensitiveFileAccessAskPermissionPolicy;
  private readonly gitControl: GitControlPathAccessAskPermissionPolicy;
  private readonly cwdOutside: CwdOutsideFileWriteAskPermissionPolicy;

  constructor(private readonly agent: Agent) {
    this.sensitive = new SensitiveFileAccessAskPermissionPolicy(agent);
    this.gitControl = new GitControlPathAccessAskPermissionPolicy(agent);
    this.cwdOutside = new CwdOutsideFileWriteAskPermissionPolicy(agent);
  }

  async evaluate(context: PermissionPolicyContext): Promise<PermissionPolicyResult | undefined> {
    if (this.agent.permission.mode !== 'auto') return;

    const sensitive = this.sensitive.evaluate(context);
    if (sensitive !== undefined) return deny(sensitive, 'Accessing a sensitive file');

    const writesOnly: PermissionPolicyContext = {
      ...context,
      execution: { ...context.execution, accesses: writeFileAccesses(context) },
    };
    const gitControl = await this.gitControl.evaluate(writesOnly);
    if (gitControl !== undefined) return deny(gitControl, 'Writing to a git control path');

    const cwdOutside = this.cwdOutside.evaluate(context);
    if (cwdOutside !== undefined) return deny(cwdOutside, 'Writing outside the working directory');
  }
}

function deny(result: PermissionPolicyResult, action: string): PermissionPolicyResult {
  return {
    kind: 'deny',
    reason: result.reason,
    message: `${action} is not allowed in auto permission mode. ${AUTO_MODE_DENY_HINT}`,
  };
}
