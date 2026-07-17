import {
  applyDayThemeMutation,
  DAY_THEME_MAX_LENGTH,
  normalizeLabelWriteInput,
  normalizeThemeWriteInput,
  readDayThemeMap,
} from './day-theme-write.util';

describe('day-theme-write.util', () => {
  it('normalizes theme clear / trim / too long', () => {
    expect(normalizeThemeWriteInput({ theme: null })).toEqual({ ok: true, value: null });
    expect(normalizeThemeWriteInput({ clearTheme: true })).toEqual({ ok: true, value: null });
    expect(normalizeThemeWriteInput({ theme: '  南岸  ' })).toEqual({
      ok: true,
      value: '南岸',
    });
    expect(normalizeThemeWriteInput({ theme: '' }).ok).toBe(false);
    expect(normalizeThemeWriteInput({ theme: 'x'.repeat(DAY_THEME_MAX_LENGTH + 1) })).toMatchObject({
      ok: false,
      code: 'THEME_TOO_LONG',
    });
  });

  it('applies theme/label mutations without touching other metadata', () => {
    const next = applyDayThemeMutation(
      { dayThemes: { '1': '旧' }, foo: 1 },
      2,
      '新主题',
      '南岸',
      'user',
    );
    expect(next.foo).toBe(1);
    expect(readDayThemeMap(next)).toEqual({ '1': '旧', '2': '新主题' });
    expect((next.dayLabels as Record<string, string>)['2']).toBe('南岸');
    expect((next.dayThemeSources as Record<string, string>)['2']).toBe('user');

    const cleared = applyDayThemeMutation(next, 1, null, undefined, 'user');
    expect(readDayThemeMap(cleared)['1']).toBeUndefined();
    expect(readDayThemeMap(cleared)['2']).toBe('新主题');
  });

  it('normalizes label empty to null', () => {
    expect(normalizeLabelWriteInput('  ')).toEqual({ ok: true, value: null });
    expect(normalizeLabelWriteInput(undefined)).toEqual({ ok: true, value: undefined });
  });
});
