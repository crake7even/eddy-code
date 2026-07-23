import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { EDDY_CODE_PLUGIN_MARKETPLACE_URL } from '#/constant/app';
import { loadPluginMarketplace } from '#/utils/plugin-marketplace';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('loadPluginMarketplace', () => {
  it('loads a local marketplace file and resolves relative plugin sources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eddy-plugin-marketplace-'));
    const file = join(dir, 'marketplace.json');
    await writeFile(
      file,
      JSON.stringify({
        version: '1',
        plugins: [
          {
            id: 'eddy-datasource',
            tier: 'official',
            displayName: 'Eddy Datasource',
            version: '1.0.0',
            description: 'Datasource tools',
            source: './eddy-datasource',
            keywords: ['data'],
          },
          {
            id: 'superpowers',
            tier: 'curated',
            displayName: 'Superpowers',
            version: '5.1.0',
            description: 'Workflow skills',
            homepage: 'https://github.com/obra/superpowers',
            source: './curated/superpowers',
            keywords: ['skills', 'workflow'],
          },
        ],
      }),
      'utf8',
    );

    const marketplace = await loadPluginMarketplace({ workDir: '/tmp/work', source: file });

    expect(marketplace).toEqual({
      source: file,
      version: '1',
      plugins: [
        {
          id: 'eddy-datasource',
          displayName: 'Eddy Datasource',
          tier: 'official',
          version: '1.0.0',
          description: 'Datasource tools',
          source: join(dir, 'eddy-datasource'),
          keywords: ['data'],
          homepage: undefined,
        },
        {
          id: 'superpowers',
          displayName: 'Superpowers',
          tier: 'curated',
          version: '5.1.0',
          description: 'Workflow skills',
          source: join(dir, 'curated', 'superpowers'),
          keywords: ['skills', 'workflow'],
          homepage: 'https://github.com/obra/superpowers',
        },
      ],
    });
  });

  it('loads the default CDN marketplace with injectable fetch', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          plugins: [
            {
              id: 'eddy-datasource',
              displayName: 'Eddy Datasource',
              source: './official/eddy-datasource.zip',
            },
          ],
        }),
    })) as unknown as typeof fetch;

    const marketplace = await loadPluginMarketplace({
      workDir: '/tmp/work',
      source: EDDY_CODE_PLUGIN_MARKETPLACE_URL,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(EDDY_CODE_PLUGIN_MARKETPLACE_URL);
    expect(marketplace.plugins[0]).toEqual(
      expect.objectContaining({
        id: 'eddy-datasource',
        displayName: 'Eddy Datasource',
        source: new URL(
          './official/eddy-datasource.zip',
          EDDY_CODE_PLUGIN_MARKETPLACE_URL,
        ).toString(),
      }),
    );
  });

  it('loads an explicit remote marketplace with injectable fetch', async () => {
    const source = 'https://example.com/plugins/marketplace.json';
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          plugins: [{ id: 'superpowers', name: 'Superpowers', url: 'superpowers.zip' }],
        }),
    })) as unknown as typeof fetch;

    const marketplace = await loadPluginMarketplace({ workDir: '/tmp/work', source, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(source);
    expect(marketplace.plugins[0]).toEqual(
      expect.objectContaining({
        id: 'superpowers',
        displayName: 'Superpowers',
        source: new URL('superpowers.zip', source).toString(),
      }),
    );
  });

  it('rejects malformed marketplace entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eddy-plugin-marketplace-'));
    const file = join(dir, 'marketplace.json');
    await writeFile(file, JSON.stringify({ plugins: [{ displayName: 'Missing id' }] }), 'utf8');

    await expect(loadPluginMarketplace({ workDir: '/tmp/work', source: file })).rejects.toThrow(
      /蹇呴』瀹氫箟 "id"/,
    );
  });

  it('rejects unknown marketplace tier values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eddy-plugin-marketplace-'));
    const file = join(dir, 'marketplace.json');
    await writeFile(
      file,
      JSON.stringify({
        plugins: [{ id: 'demo', tier: 'community', source: './demo' }],
      }),
      'utf8',
    );

    await expect(loadPluginMarketplace({ workDir: '/tmp/work', source: file })).rejects.toThrow(
      /"tier" 蹇呴』鏄互涓嬩箣涓€/,
    );
  });
});
