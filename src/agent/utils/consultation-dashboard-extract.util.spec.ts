import {
  extractConsultationDashboardFromAnswer,
  sanitizeConsultationDashboard,
} from './consultation-dashboard-extract.util';

describe('consultation-dashboard-extract', () => {
  it('extracts dashboard JSON and strips markers', () => {
    const raw = `前言。\n\n<<<CONSULTATION_UI_JSON>>>\n{"version":1,"headline":"可行","summary_cards":[{"id":"b","title":"预算","value":"2万","tone":"warning"}]}\n<<<END_CONSULTATION_UI_JSON>>>\n\n尾部`;
    const { cleanText, dashboard } = extractConsultationDashboardFromAnswer(raw);
    expect(cleanText).toContain('前言');
    expect(cleanText).toContain('尾部');
    expect(cleanText).not.toContain('CONSULTATION_UI_JSON');
    expect(dashboard?.version).toBe(1);
    expect(dashboard?.headline).toBe('可行');
    expect(dashboard?.summary_cards?.[0]?.title).toBe('预算');
  });

  it('sanitize drops empty payloads', () => {
    expect(sanitizeConsultationDashboard({ version: 1 })).toBeUndefined();
  });

  it('invalid JSON strips markers but returns no dashboard', () => {
    const raw = 'x <<<CONSULTATION_UI_JSON>>> not-json <<<END_CONSULTATION_UI_JSON>>>';
    const { cleanText, dashboard } = extractConsultationDashboardFromAnswer(raw);
    expect(dashboard).toBeUndefined();
    expect(cleanText).toBe('x');
    expect(cleanText).not.toContain('CONSULTATION_UI_JSON');
  });
});
