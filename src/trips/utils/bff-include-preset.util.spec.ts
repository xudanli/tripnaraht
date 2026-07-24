import { resolveBffIncludeFromPreset } from './bff-include-preset.util';

describe('resolveBffIncludeFromPreset', () => {
  it('maps timeline shell preset', () => {
    expect(
      resolveBffIncludeFromPreset({ preset: 'shell', kind: 'timeline' }),
    ).toBe('stats,readiness');
  });

  it('maps collab shell preset', () => {
    expect(
      resolveBffIncludeFromPreset({ preset: 'shell', kind: 'collab' }),
    ).toBe('members,health');
  });

  it('explicit include wins over absent preset', () => {
    expect(
      resolveBffIncludeFromPreset({
        include: 'stats,tasks',
        kind: 'timeline',
      }),
    ).toBe('stats,tasks');
  });

  it('explicit include wins over preset', () => {
    expect(
      resolveBffIncludeFromPreset({
        preset: 'shell',
        include: 'stats,tasks,suggestions',
        kind: 'timeline',
      }),
    ).toBe('stats,tasks,suggestions');
  });

  it('maps timeline full preset without suggestions list', () => {
    expect(
      resolveBffIncludeFromPreset({ preset: 'full', kind: 'timeline' }),
    ).toBe('stats,pipeline,tasks,reminders,readiness');
  });
});
