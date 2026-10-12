import { TUI, type Component, type Terminal } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';

class FakeTerminal implements Terminal {
  columns = 80;
  rows = 10;
  kittyProtocolActive = false;
  output = '';

  start(): void {}
  stop(): void {}
  async drainInput(): Promise<void> {}
  write(data: string): void {
    this.output += data;
  }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

class Lines implements Component {
  constructor(public lines: string[]) {}
  render(): string[] {
    return this.lines;
  }
  invalidate(): void {}
}

function numbered(count: number, prefix = 'line'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(3, '0')}`);
}

function setup(lines: string[]): { terminal: FakeTerminal; ui: TUI; content: Lines; render(): void } {
  const terminal = new FakeTerminal();
  const ui = new TUI(terminal);
  const content = new Lines(lines);
  ui.addChild(content);
  const render = (): void => {
    (ui as unknown as { doRender(): void }).doRender();
  };
  render();
  terminal.output = '';
  return { terminal, ui, content, render };
}

async function flushForcedRender(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.nextTick(resolve);
  });
}

describe('pi-tui scrollback behavior', () => {
  it('writes every line on the first render', () => {
    const terminal = new FakeTerminal();
    const ui = new TUI(terminal);
    ui.addChild(new Lines(numbered(30)));

    (ui as unknown as { doRender(): void }).doRender();

    expect(terminal.output).toContain('line-000');
    expect(terminal.output).toContain('line-029');
  });

  it('repaints only the viewport when the terminal width changes', () => {
    const { terminal, render } = setup(numbered(30));

    terminal.columns = 100;
    render();

    expect(terminal.output).toContain('\x1b[H\x1b[J');
    expect(terminal.output).not.toContain('\x1b[2J');
    expect(terminal.output).not.toContain('\x1b[3J');
    expect(terminal.output).not.toContain('line-019');
    expect(terminal.output).toContain('line-020');
    expect(terminal.output).toContain('line-029');
  });

  it('does not replay history when a line above the viewport changes', () => {
    const { terminal, content, render } = setup(numbered(30));

    content.lines = ['changed-header', ...numbered(30).slice(1)];
    render();

    expect(terminal.output).not.toContain('changed-header');
    expect(terminal.output).not.toContain('line-019');
    expect(terminal.output).toContain('line-020');
    expect(terminal.output).toContain('line-029');
  });

  it('keeps rows that were never shown when content also grows past the viewport', () => {
    const { terminal, content, render } = setup(numbered(30));

    content.lines = ['changed-header', ...numbered(30).slice(1), ...numbered(15, 'new')];
    render();

    // Previous viewport started at line-020; nothing from there on may be skipped.
    expect(terminal.output).not.toContain('line-019');
    expect(terminal.output).toContain('line-020');
    expect(terminal.output).toContain('new-000');
    expect(terminal.output).toContain('new-014');
  });

  it('repaints only the viewport on a forced render', async () => {
    const { terminal, ui } = setup(numbered(30));

    ui.requestRender(true);
    await flushForcedRender();

    expect(terminal.output).not.toContain('\x1b[3J');
    expect(terminal.output).not.toContain('line-019');
    expect(terminal.output).toContain('line-029');
  });

  it('replays every line into a cleared scrollback on request', async () => {
    const { terminal, ui } = setup(numbered(30));

    ui.requestHistoryReplay(true);
    await flushForcedRender();

    expect(terminal.output).toContain('\x1b[2J\x1b[H\x1b[3J');
    expect(terminal.output).toContain('line-000');
    expect(terminal.output).toContain('line-029');

    terminal.output = '';
    ui.requestRender(true);
    await flushForcedRender();
    expect(terminal.output).not.toContain('line-000');
  });
});
