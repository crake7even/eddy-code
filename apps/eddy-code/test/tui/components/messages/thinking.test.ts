import type { TUI } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { ThinkingComponent } from '#/tui/components/messages/thinking';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

const longThinking = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'].join('\n');

describe('ThinkingComponent', () => {
  it('shows only the live spinner header while thinking', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true, 'live');
    const out = strip(component.render(80).join('\n'));

    expect(out).toContain('⠋ 思考中...');
    expect(out).not.toContain('  ⠋ 思考中...');
    expect(out).not.toContain(`${STATUS_BULLET}⠋`);
    expect(out).not.toContain('line');
  });

  it('animates the live spinner and stops on finalize', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const component = new ThinkingComponent('step', darkColors, true, 'live', {
      requestRender,
    } as unknown as TUI);

    expect(strip(component.render(80).join('\n'))).toContain('⠋ 思考中...');

    vi.advanceTimersByTime(80);
    expect(requestRender).toHaveBeenCalled();
    expect(strip(component.render(80).join('\n'))).toContain('⠙ 思考中...');

    component.finalize();
    requestRender.mockClear();
    vi.advanceTimersByTime(160);
    expect(requestRender).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('finalizes in place into a single summary line', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true, 'live');

    component.finalize();

    const lines = component.render(80).map(strip);
    expect(lines).toEqual(['', `${STATUS_BULLET}已思考 · ctrl+o 查看`]);
  });

  it('summarizes the tool calls or answer that followed', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true);

    component.setFollowUp({ kind: 'tools', labels: ['读取文件', '运行命令', '读取文件'] });
    expect(strip(component.render(80).join('\n'))).toContain('思考后：读取文件、运行命令 · ctrl+o 查看');

    component.setFollowUp({
      kind: 'tools',
      labels: ['读取文件', '运行命令', '修改文件', '上网搜索'],
    });
    expect(strip(component.render(80).join('\n'))).toContain('思考后：读取文件、运行命令、修改文件等 4 项');

    component.setFollowUp({ kind: 'answer' });
    expect(strip(component.render(80).join('\n'))).toContain('思考后：整理回答');
  });

  it('expands and collapses after finalization', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true, 'live');
    component.finalize();

    component.setExpanded(true);
    const expanded = strip(component.render(80).join('\n'));
    expect(expanded).toContain('line1');
    expect(expanded).toContain('line7');
    expect(expanded).not.toContain('ctrl+o 查看');

    component.setExpanded(false);
    const collapsed = strip(component.render(80).join('\n'));
    expect(collapsed).not.toContain('line1');
    expect(collapsed).toContain('ctrl+o 查看');
  });

  it('caches finalized mode renders for the same width', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true, 'live');
    component.finalize();

    const first = component.render(80);
    const second = component.render(80);

    expect(second).toBe(first);
  });

  it('does not cache live mode renders', () => {
    const component = new ThinkingComponent('step', darkColors, true, 'live');

    const first = component.render(80);
    const second = component.render(80);

    expect(second).not.toBe(first);
  });

  it('invalidates cache on setText, setExpanded, finalize, and invalidate', () => {
    const component = new ThinkingComponent(longThinking, darkColors, true, 'live');
    component.finalize();

    const initial = component.render(80);

    component.setText('changed');
    expect(component.render(80)).not.toBe(initial);

    const afterText = component.render(80);
    component.setExpanded(true);
    expect(component.render(80)).not.toBe(afterText);

    const live = new ThinkingComponent('x', darkColors, true, 'live');
    const liveFirst = live.render(80);
    live.finalize();
    expect(live.render(80)).not.toBe(liveFirst);

    const finalized = live.render(80);
    live.invalidate();
    expect(live.render(80)).not.toBe(finalized);
  });
});
