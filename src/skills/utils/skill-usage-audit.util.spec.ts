import {
  filterSkillsForToolSelect,
  getToolSelectExcludedSkillNames,
  isToolSelectUsageMaskEnabled,
} from './skill-usage-audit.util';

describe('skill-usage-audit.util', () => {
  const skills = [
    { metadata: { name: 'transport.search', description: 'a' } },
    { metadata: { name: 'world.adaptiveParameters', description: 'b' } },
  ] as any[];

  it('excludes CANDIDATE_DEPRECATE skills by default', () => {
    const prev = process.env.TOOLS_SELECT_USAGE_MASK;
    delete process.env.TOOLS_SELECT_USAGE_MASK;
    const excluded = getToolSelectExcludedSkillNames();
    expect(excluded.has('world.adaptiveParameters')).toBe(true);
    expect(excluded.has('context.learn')).toBe(true);
    const filtered = filterSkillsForToolSelect(skills);
    expect(filtered.map((s) => s.metadata.name)).toEqual(['transport.search']);
    if (prev === undefined) delete process.env.TOOLS_SELECT_USAGE_MASK;
    else process.env.TOOLS_SELECT_USAGE_MASK = prev;
  });

  it('can disable mask via TOOLS_SELECT_USAGE_MASK=0', () => {
    process.env.TOOLS_SELECT_USAGE_MASK = '0';
    expect(isToolSelectUsageMaskEnabled()).toBe(false);
    expect(filterSkillsForToolSelect(skills)).toHaveLength(2);
    delete process.env.TOOLS_SELECT_USAGE_MASK;
  });
});
