import { describe, expect, it } from 'vitest';
import { OldEddyJsonSchema, OldSessionStateSchema } from '../src/eddy-cli-schema.js';

describe('OldEddyJsonSchema', () => {
  it('parses a real-shape eddy.json', () => {
    const input = {
      work_dirs: [
        { path: '/Users/x/proj', jian: 'local', last_session_id: 'abc' },
        { path: '/Users/x/other', jian: 'local', last_session_id: null },
      ],
    };
    const parsed = OldEddyJsonSchema.parse(input);
    expect(parsed.work_dirs).toHaveLength(2);
    expect(parsed.work_dirs[0]!.jian).toBe('local');
  });

  it('accepts missing last_session_id', () => {
    const input = { work_dirs: [{ path: '/x', jian: 'local' }] };
    expect(() => OldEddyJsonSchema.parse(input)).not.toThrow();
  });
});

describe('OldSessionStateSchema', () => {
  it('parses a realistic state.json', () => {
    const input = {
      version: 1,
      approval: { yolo: false, afk: false, auto_approve_actions: [] },
      additional_dirs: [],
      custom_title: 'hi',
      title_generated: false,
      title_generate_attempts: 0,
      plan_mode: false,
      plan_session_id: null,
      plan_slug: null,
      wire_mtime: 1772616338.93,
      archived: true,
      archived_at: 1774273349.5,
      auto_archive_exempt: false,
    };
    const parsed = OldSessionStateSchema.parse(input);
    expect(parsed.custom_title).toBe('hi');
    expect(parsed.archived).toBe(true);
  });

  it('tolerates missing optional fields', () => {
    expect(() => OldSessionStateSchema.parse({ version: 1 })).not.toThrow();
  });
});
