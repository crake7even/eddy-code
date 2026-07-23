import { DynamicInjector } from './injector';

export class WorkingSetInjector extends DynamicInjector {
  protected readonly injectionVariant = 'working-set';

  protected getInjection(): string | undefined {
    const paths = this.agent.workingSet.getPaths();
    if (paths.length === 0) return undefined;

    return [
      '## Working Set',
      '',
      '当前任务可能涉及以下文件：',
      ...paths.map((p) => `- ${p}`),
      '',
      '优先检查这些文件，避免重复读取未修改文件。',
    ].join('\n');
  }
}
