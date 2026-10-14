import { describe, expect, it } from 'vitest';

import { ActivityGroupComponent } from '#/tui/components/messages/activity-group';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function text(component: ActivityGroupComponent): string {
  return strip(component.render(80).join('\n'));
}

describe('ActivityGroupComponent', () => {
  it('shows a spinner with the current action while live', () => {
    const group = new ActivityGroupComponent(darkColors);
    expect(text(group)).toContain('⠋ 思考中…');

    group.setLiveLabel('正在读取文件 config.toml…');
    expect(text(group)).toContain('⠋ 正在读取文件 config.toml…');
  });

  it('collapses to a tool count once finished, with failures called out', () => {
    const group = new ActivityGroupComponent(darkColors);
    group.addTool();
    group.addTool();
    group.addTool();
    group.addFailure();
    group.finish();

    expect(text(group)).toBe('\n● 已使用 3 个工具 › · 1 个失败');
    expect(group.summary()).toBe('已使用 3 个工具');
  });

  it('says it only thought when no tools ran, and flips the chevron on expand', () => {
    const group = new ActivityGroupComponent(darkColors);
    group.finish();
    expect(text(group)).toContain('已思考 ›');

    group.setExpanded(true);
    expect(text(group)).toContain('已思考 ⌄');
  });
});
