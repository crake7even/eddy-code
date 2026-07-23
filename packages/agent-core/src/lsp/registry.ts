import type { Jian } from '@eddy-code/jian';

import { LspClient } from './client';

export interface LspCommand {
  readonly command: string[];
  readonly languageId: string;
}

const LANGUAGE_SERVERS: Readonly<Record<string, LspCommand>> = {
  '.ts': { command: ['typescript-language-server', '--stdio'], languageId: 'typescript' },
  '.tsx': { command: ['typescript-language-server', '--stdio'], languageId: 'typescriptreact' },
  '.js': { command: ['typescript-language-server', '--stdio'], languageId: 'javascript' },
  '.jsx': { command: ['typescript-language-server', '--stdio'], languageId: 'javascriptreact' },
  '.py': { command: ['pyright-langserver', '--stdio'], languageId: 'python' },
  '.rs': { command: ['rust-analyzer'], languageId: 'rust' },
  '.go': { command: ['gopls'], languageId: 'go' },
};

export class LspRegistry {
  private readonly clients = new Map<string, LspClient>();

  constructor(private readonly jian: Jian) {}

  /**
   * Get or create an LSP client for the given file path and workspace root.
   * Returns undefined if the file type is not supported.
   */
  async getClient(path: string, workspaceRoot: string): Promise<LspClient | undefined> {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const config = LANGUAGE_SERVERS[ext];
    if (config === undefined) return undefined;

    const key = `${workspaceRoot}\0${config.command.join(' ')}`;
    let client = this.clients.get(key);
    if (client === undefined) {
      client = new LspClient(config.command, workspaceRoot, this.jian);
      this.clients.set(key, client);
      await client.start();
    }
    return client;
  }

  languageIdForPath(path: string): string | undefined {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    return LANGUAGE_SERVERS[ext]?.languageId;
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.stop()));
    this.clients.clear();
  }
}
