import { Container, Text } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';

import {
  TranscriptContainer,
  collapseInTranscript,
  isCollapsedInTranscript,
} from '#/tui/components/chrome/transcript-container';

describe('TranscriptContainer', () => {
  it('hides collapsed children until shown, keeping them in children', () => {
    const container = new TranscriptContainer(0, 0);
    const visible = new Text('visible', 0, 0);
    const hidden = new Text('hidden', 0, 0);
    container.addChild(visible);
    container.addChild(hidden);
    collapseInTranscript(container, hidden);

    expect(container.children).toHaveLength(2);
    expect(isCollapsedInTranscript(container, hidden)).toBe(true);
    expect(container.render(40).join('\n')).not.toContain('hidden');

    container.setShowCollapsed(true);
    expect(container.render(40).join('\n')).toContain('hidden');
  });

  it('treats plain containers as never collapsed', () => {
    const plain = new Container();
    const child = new Text('x', 0, 0);
    collapseInTranscript(plain, child);
    expect(isCollapsedInTranscript(plain, child)).toBe(false);
  });
});
