/**
 * Renders thinking content in the transcript.
 * Supports live in-place updates while thinking streams, then finalizes
 * without replacing the component.
 * Supports expand/collapse via Ctrl+O (shared with tool output).
 */

import type { Component, TUI } from '@earendil-works/pi-tui';
import { Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
  MESSAGE_INDENT,
} from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';
import type { ThinkingFollowUp } from '#/tui/types';
import { summarizeToolActions } from '#/tui/utils/tool-labels';

export type ThinkingRenderMode = 'live' | 'finalized';

export class ThinkingComponent implements Component {
  private text: string;
  private color: string;
  private showMarker: boolean;
  private mode: ThinkingRenderMode;
  private expanded = false;
  private followUp: ThinkingFollowUp | undefined;
  private readonly ui: TUI | undefined;
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | undefined;
  // Hold a single Text instance so pi-tui's (text, width) → lines cache
  // actually survives across renders. Re-constructing per render destroys
  // the cache and forces full re-wrap on every frame, which dominates CPU
  // once the transcript accumulates many finalized thinking blocks.
  private readonly textComponent: Text;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    text: string,
    colors: ColorPalette,
    showMarker: boolean = true,
    mode: ThinkingRenderMode = 'finalized',
    ui?: TUI,
  ) {
    this.text = text;
    this.color = colors.roleThinking;
    this.showMarker = showMarker;
    this.mode = mode;
    this.ui = ui;
    this.textComponent = new Text(this.styled(text), 0, 0);
    if (mode === 'live') {
      this.startSpinner();
    }
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.textComponent.setText(this.styled(text));
  }

  private styled(text: string): string {
    return chalk.hex(this.color).italic(text);
  }

  finalize(): void {
    if (this.mode === 'finalized') return;
    this.mode = 'finalized';
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.stopSpinner();
  }

  dispose(): void {
    this.stopSpinner();
  }

  setFollowUp(followUp: ThinkingFollowUp | undefined): void {
    this.followUp = followUp;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    // Live mode is intentionally not cached: the spinner frame changes every
    // 80 ms, and returning a stale cached array would freeze the animation.
    if (this.mode === 'finalized' && this.cachedLines !== undefined && this.cachedWidth === width) {
      return this.cachedLines;
    }

    if (this.mode === 'live') {
      const spinner = chalk.hex(this.color)(
        `${BRAILLE_SPINNER_FRAMES[this.spinnerFrame] ?? BRAILLE_SPINNER_FRAMES[0]} `,
      );
      return ['', spinner + chalk.hex(this.color)('思考中...')];
    }

    if (!this.expanded) {
      const marker = this.showMarker ? chalk.hex(this.color)(STATUS_BULLET) : MESSAGE_INDENT;
      const summary = chalk.hex(this.color)(this.summaryLabel());
      const lines = ['', marker + summary + chalk.dim(' · ctrl+o 查看')];
      this.cachedWidth = width;
      this.cachedLines = lines;
      return lines;
    }

    const contentWidth = Math.max(1, width - MESSAGE_INDENT.length);
    const contentLines = this.text.length > 0 ? this.textComponent.render(contentWidth) : [''];

    const rendered: string[] = [''];
    for (let i = 0; i < contentLines.length; i++) {
      const p = i === 0 && this.showMarker ? chalk.hex(this.color)(STATUS_BULLET) : MESSAGE_INDENT;
      rendered.push(p + contentLines[i]);
    }

    this.cachedWidth = width;
    this.cachedLines = rendered;
    return rendered;
  }

  private summaryLabel(): string {
    if (this.followUp?.kind === 'tools' && this.followUp.labels.length > 0) {
      return `思考后：${summarizeToolActions(this.followUp.labels)}`;
    }
    if (this.followUp?.kind === 'answer') return '思考后：整理回答';
    return '已思考';
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
