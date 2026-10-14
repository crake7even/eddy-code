/**
 * Transcript container that can hide finished activity (thinking, tool
 * calls, approval notices) behind a one-line group header. Hidden children
 * stay in `children`, so index-based lookups, revoke, and commit keep
 * working; they are only skipped at render time until ctrl+o expands them.
 */

import type { Component, Container } from '@earendil-works/pi-tui';

import { GutterContainer } from './gutter-container';

export class TranscriptContainer extends GutterContainer {
  private readonly collapsed = new WeakSet<Component>();
  private showCollapsed = false;

  collapse(component: Component): void {
    this.collapsed.add(component);
  }

  isCollapsed(component: Component): boolean {
    return this.collapsed.has(component);
  }

  setShowCollapsed(show: boolean): void {
    this.showCollapsed = show;
  }

  protected override isChildVisible(child: Component): boolean {
    return this.showCollapsed || !this.collapsed.has(child);
  }
}

/** Hide `component` behind its activity header; no-op for plain containers. */
export function collapseInTranscript(container: Container, component: Component): void {
  if (container instanceof TranscriptContainer) container.collapse(component);
}

export function isCollapsedInTranscript(container: Container, component: Component): boolean {
  return container instanceof TranscriptContainer && container.isCollapsed(component);
}
