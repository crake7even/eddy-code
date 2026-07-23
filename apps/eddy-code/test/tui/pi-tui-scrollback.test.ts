import { Text, TUI, type Terminal } from '@earendil-works/pi-tui';
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

describe('pi-tui scrollback behavior', () => {
  it('preserves scrollback during full redraws caused by terminal width changes', () => {
    const terminal = new FakeTerminal();
    const ui = new TUI(terminal);
    ui.addChild(new Text('hello', 0, 0));

    (ui as unknown as { doRender(): void }).doRender();
    terminal.output = '';
    terminal.columns = 100;
    (ui as unknown as { doRender(): void }).doRender();

    expect(terminal.output).toContain('\x1b[2J\x1b[H');
    expect(terminal.output).not.toContain('\x1b[3J');
  });
});
