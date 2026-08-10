import {
  buildClarificationMessage,
  translateSkillName,
} from './service-unavailable-clarification.runner';

describe('service-unavailable-clarification.runner', () => {
  it('translates skill names and builds message', () => {
    expect(translateSkillName('poi.search')).toBe('地点搜索服务');
    const msg = buildClarificationMessage({
      skillName: 'poi.search',
      solutions: ['稍后重试'],
    });
    expect(msg).toContain('地点搜索服务');
    expect(msg).toContain('稍后重试');
  });
});
