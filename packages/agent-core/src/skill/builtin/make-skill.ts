import { parseSkillText } from '../parser';
import type { SkillDefinition } from '../types';
import MAKE_SKILL_BODY from './make-skill.md';

const PSEUDO_PATH = 'builtin://make-skill';

const parsed = parseSkillText({
  skillMdPath: '/builtin/skills/make-skill.md',
  skillDirName: 'make-skill',
  source: 'builtin',
  text: MAKE_SKILL_BODY,
});

export const MAKE_SKILL_SKILL: SkillDefinition = {
  ...parsed,
  path: PSEUDO_PATH,
  dir: PSEUDO_PATH,
  metadata: {
    ...parsed.metadata,
    type: parsed.metadata.type ?? 'inline',
    disableModelInvocation: true,
  },
};
