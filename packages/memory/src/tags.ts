import { extractKeywords } from './scoring.js';

/**
 * Normalize a tag list: lowercase, trim, deduplicate, drop empties,
 * and cap at `max` entries.
 */
export function normalizeTags(tags: unknown, max = 5): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase();
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * Generate a small set of semantic tags from free-form text.
 * Falls back to keyword extraction when the caller does not supply tags.
 */
export function generateTags(text: string, max = 5): string[] {
  const keywords = extractKeywords(text);
  return normalizeTags(keywords, max);
}
