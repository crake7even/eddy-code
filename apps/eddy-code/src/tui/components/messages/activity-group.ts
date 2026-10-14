/**
 * One-line header for a run of agent activity (thinking, tool calls,
 * approval notices). While the run is live it shows a spinner and the
 * current action; once finished it collapses to "已使用 N 个工具 ›" and the
 * members stay hidden in the transcript until ctrl+o expands them.
 */

import type { Component, TUI } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { BRAILLE_SPINNER_FRAMES, BRAILLE_SPINNER_INTERVAL_MS } from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';

export class ActivityGroupComponent implements Component {
  private liveLabel = '思考中…';
  private toolCount = 0;
  private failedCount = 0;
  private finished = false;
  private expanded = false;
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly colors: ColorPalette,
    private readonly ui?: TUI,
  ) {
    this.startSpinner();
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get currentLabel(): string {
    return this.liveLabel;
  }

  setLiveLabel(label: string): void {
    this.liveLabel = label;
  }

  get hasTools(): boolean {
    return this.toolCount > 0;
  }

  addTool(): void {
    this.toolCount += 1;
  }

  addFailure(): void {
    this.failedCount += 1;
  }

  /** Plain summary of the finished run, also used for committed history. */
  summary(): string {
    return this.toolCount > 0 ? `已使用 ${String(this.toolCount)} 个工具` : '已思考';
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopSpinner();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  invalidate(): void {}

  dispose(): void {
    this.stopSpinner();
  }

  render(_width: number): string[] {
    if (!this.finished) {
      const frame = BRAILLE_SPINNER_FRAMES[this.spinnerFrame] ?? BRAILLE_SPINNER_FRAMES[0];
      return ['', chalk.hex(this.colors.roleThinking)(`${frame} ${this.liveLabel}`)];
    }
    const dim = chalk.hex(this.colors.textDim);
    let line = dim(STATUS_BULLET) + dim(`${this.summary()} ${this.expanded ? '⌄' : '›'}`);
    if (this.failedCount > 0) {
      line += chalk.hex(this.colors.error)(` · ${String(this.failedCount)} 个失败`);
    }
    return ['', line];
  }

  private startSpinner(): void {
    if (this.ui === undefined || this.spinnerInterval !== undefined) return;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % BRAILLE_SPINNER_FRAMES.length;
      this.ui?.requestRender();
    }, BRAILLE_SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval === undefined) return;
    clearInterval(this.spinnerInterval);
    this.spinnerInterval = undefined;
  }
}
