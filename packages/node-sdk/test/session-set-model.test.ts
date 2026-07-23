import { afterEach, describe, expect, it } from 'vitest';

import { EddyHarness, type EddyError } from '#/index';
import { makeTempDir, removeTempDirs, waitForAgentWireEvent } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe('Session.setModel', () => {
  it('updates the runtime model and sends config.update with the resolved model', async () => {
    const homeDir = await makeTempDir(tempDirs, 'eddy-sdk-model-home-');
    const workDir = await makeTempDir(tempDirs, 'eddy-sdk-model-work-');
    const harness = new EddyHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      await configureLocalProvider(harness);
      const session = await harness.createSession({
        id: 'ses_model_wire',
        workDir,
        model: 'initial-model',
      });

      await session.setModel('next-model');

      await expect(session.getStatus()).resolves.toMatchObject({ model: 'next-model' });
      const configEvent = await waitForAgentWireEvent(
        homeDir,
        session.id,
        'config.update',
        (event) => event['modelAlias'] === 'next-model',
      );
      expect(configEvent).toMatchObject({
        type: 'config.update',
        modelAlias: 'next-model',
      });
      expect(configEvent).not.toHaveProperty('provider');
    } finally {
      await harness.close();
    }
  });

  it('rejects empty model names', async () => {
    const homeDir = await makeTempDir(tempDirs, 'eddy-sdk-model-home-');
    const workDir = await makeTempDir(tempDirs, 'eddy-sdk-model-work-');
    const harness = new EddyHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      await configureLocalProvider(harness);
      const session = await harness.createSession({ id: 'ses_model_empty', workDir });

      await expect(session.setModel('   ')).rejects.toMatchObject({
        name: 'EddyError',
        code: 'session.model_empty',
      } satisfies Partial<EddyError>);
    } finally {
      await harness.close();
    }
  });

  it('rejects after the session is closed', async () => {
    const homeDir = await makeTempDir(tempDirs, 'eddy-sdk-model-home-');
    const workDir = await makeTempDir(tempDirs, 'eddy-sdk-model-work-');
    const harness = new EddyHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      await configureLocalProvider(harness);
      const session = await harness.createSession({ id: 'ses_model_closed', workDir });
      await session.close();

      await expect(session.setModel('next-model')).rejects.toMatchObject({
        name: 'EddyError',
        code: 'session.closed',
      } satisfies Partial<EddyError>);
    } finally {
      await harness.close();
    }
  });
});

async function configureLocalProvider(harness: EddyHarness): Promise<void> {
  await harness.setConfig({
    providers: {
      local: {
        type: 'eddy',
        apiKey: 'sk-test',
      },
    },
    models: {
      'initial-model': {
        provider: 'local',
        model: 'initial-model',
        maxContextSize: 262144,
      },
      'next-model': {
        provider: 'local',
        model: 'next-model',
        maxContextSize: 262144,
      },
    },
    defaultProvider: 'local',
  });
}
