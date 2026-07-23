/**
 * `eddy migrate` 鈥?permanently disabled. The command is kept for backwards
 * compatibility but prints a notice and exits.
 */

import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import { registerMigrateCommand } from '#/migration/command';

describe('registerMigrateCommand', () => {
  it('adds a flagless migrate subcommand to the program', () => {
    const program = new Command('eddy');
    registerMigrateCommand(program, () => {});
    const sub = program.commands.find((c) => c.name() === 'migrate');
    expect(sub).toBeDefined();
    expect(sub!.description()).toContain('杩佺Щ');
    expect(sub!.options).toHaveLength(0);
  });

  it('prints a disabled notice and exits when `migrate` runs', () => {
    const program = new Command('eddy');
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    registerMigrateCommand(program, () => {});
    program.parse(['migrate'], { from: 'user' });
    expect(stdoutSpy).toHaveBeenCalledWith('杩佺Щ鍔熻兘宸插彇娑堬紝涓嶅啀鏀寔浠?eddy-code 瀵煎叆鏁版嵁銆俓n');
    expect(exitSpy).toHaveBeenCalledWith(0);
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
