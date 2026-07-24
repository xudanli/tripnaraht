import {
  attachClarificationMarkdownHtml,
  renderClarificationMarkdownToSafeHtml,
  resolveClarificationChatLead,
  sanitizeIndexedChunkMarkdownForDisplay,
} from './user-clarification-markdown.util';

describe('user-clarification-markdown.util', () => {
  it('sanitizeIndexedChunkMarkdownForDisplay strips chunk artifacts', () => {
    const s = sanitizeIndexedChunkMarkdownForDisplay(
      '[full] ## 冰岛自驾餐饮锚点指南\n本文档整合了餐厅',
    );
    expect(s).not.toMatch(/\[full\]|## /);
    expect(s).toContain('冰岛自驾餐饮锚点指南');
  });

  it('renderClarificationMarkdownToSafeHtml renders bold and sections', () => {
    const html = renderClarificationMarkdownToSafeHtml(
      '**1. 请选择极光观测日**\n\n· **D3**：北部空档较多',
    );
    expect(html).toContain('<strong>1. 请选择极光观测日</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>D3</strong>');
  });

  it('renderClarificationMarkdownToSafeHtml splits numbered sections after dedupe-style newlines', () => {
    const html = renderClarificationMarkdownToSafeHtml(
      'intro line\n**1. 请选择极光观测日**\n· **D3**：理由\n**2. 观测提示**\n提示正文',
    );
    expect(html.match(/<p>/g)?.length).toBeGreaterThan(1);
    expect(html).toContain('<strong>1. 请选择极光观测日</strong>');
  });

  it('renderClarificationMarkdownToSafeHtml renders day bullets as ul inside section', () => {
    const html = renderClarificationMarkdownToSafeHtml(
      '**1. 请选择极光观测日**\n根据当前行程草案，以下日期相对更合适：\n· D1（2026-11-01）维克周边：理由\n· D3（2026-11-03）南岸：理由',
    );
    expect(html).toContain('<ul>');
    expect(html).toContain('D1（2026-11-01）');
  });

  it('resolveClarificationChatLead returns short bubble for slot placement card', () => {
    const lead = resolveClarificationChatLead({
      id: 'itinerary_slot_placement_v1',
      question: '**1. 请选择**',
      type: 'single_choice',
      required: true,
      hint: '行程编排助手提示',
      metadata: { presentation: 'structured_intake_v1' },
    });
    expect(lead).toContain('下方卡片');
    expect(lead).not.toContain('**');
  });

  it('attachClarificationMarkdownHtml adds question_html and render_format', () => {
    const q = attachClarificationMarkdownHtml({
      id: 'itinerary_slot_placement_v1',
      question: '**标题**\n\n正文',
      type: 'single_choice',
      required: true,
    });
    expect(q.question_html).toContain('<strong>标题</strong>');
    expect(q.metadata?.render_format).toBe('markdown');
  });
});
