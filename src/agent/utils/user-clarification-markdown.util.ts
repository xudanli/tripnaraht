/**
 * 澄清卡 / NEED_MORE_INFO：用户可见 Markdown → 安全 HTML（前端 v-html / dangerouslySetInnerHTML）。
 * 仅覆盖编排澄清常用子集，不引入完整 Markdown 引擎。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

/** 索引 chunk 正文：去掉 [full]、标题符等，避免澄清卡露出原始文档 Markdown */
/** @param maxLen 省略或 ≤0 时不截断 */
export function sanitizeIndexedChunkMarkdownForDisplay(raw: string, maxLen?: number): string {
  let s = String(raw ?? '')
    .replace(/^\[(?:full|summary|excerpt|chunk)\]\s*/gim, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxLen != null && maxLen > 0 && s.length > maxLen) {
    s = `${s.slice(0, maxLen - 1)}…`;
  }
  return s;
}

function normalizeClarificationMarkdownForRender(markdown: string): string {
  return String(markdown ?? '')
    .trim()
    // dedupe 会把 \n\n 压成 \n；在「**1. …**」类小节标题前恢复段落边界
    .replace(/([^\n])\n(\*\*\d+\.[^*]*\*\*)/g, '$1\n\n$2')
    .replace(/\n(\*\*\d+\.[^*]*\*\*)/g, '\n\n$1');
}

function renderMixedLinesBlock(lines: string[]): string {
  const parts: string[] = [];
  let prose: string[] = [];
  let bullets: string[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    parts.push(`<p>${prose.map((l) => formatInlineMarkdown(l)).join('<br/>')}</p>`);
    prose = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    parts.push(
      `<ul>${bullets.map((l) => `<li>${formatInlineMarkdown(l.replace(/^[·•\-*]\s*/, ''))}</li>`).join('')}</ul>`,
    );
    bullets = [];
  };

  for (const line of lines) {
    if (/^[·•\-*]\s/.test(line)) {
      flushProse();
      bullets.push(line);
    } else {
      flushBullets();
      prose.push(line);
    }
  }
  flushBullets();
  flushProse();
  return parts.join('\n');
}

function renderBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return '';

  const h4 = trimmed.match(/^####\s+(.+)$/);
  if (h4) return `<h4>${formatInlineMarkdown(h4[1])}</h4>`;
  const h3 = trimmed.match(/^###\s+(.+)$/);
  if (h3) return `<h3>${formatInlineMarkdown(h3[1])}</h3>`;
  const h2 = trimmed.match(/^##\s+(.+)$/);
  if (h2) return `<h2>${formatInlineMarkdown(h2[1])}</h2>`;

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  const isBulletList = lines.length > 0 && lines.every((l) => /^[·•\-*]\s/.test(l));
  if (isBulletList) {
    const items = lines
      .map((l) => `<li>${formatInlineMarkdown(l.replace(/^[·•\-*]\s*/, ''))}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (lines.some((l) => /^[·•\-*]\s/.test(l))) {
    return renderMixedLinesBlock(lines);
  }

  const body = lines.map((l) => formatInlineMarkdown(l)).join('<br/>');
  return `<p>${body}</p>`;
}

/** 澄清卡 Markdown 子集 → 安全 HTML */
export function renderClarificationMarkdownToSafeHtml(markdown: string): string {
  const src = normalizeClarificationMarkdownForRender(markdown);
  if (!src) return '';
  return src
    .split(/\n\n+/)
    .map(renderBlock)
    .filter(Boolean)
    .join('\n');
}

export function attachClarificationMarkdownHtml(
  question: ClarificationQuestion,
): ClarificationQuestion {
  const md = String(question.question ?? '').trim();
  if (!md) return question;
  const question_html = renderClarificationMarkdownToSafeHtml(md);
  return {
    ...question,
    question_html,
    metadata: {
      ...(question.metadata ?? {}),
      render_format: 'markdown',
    },
  };
}

/** INTAKE 澄清卡：进度条/折叠区短文案 */
export function resolveClarificationShortStepDetail(question: ClarificationQuestion): string {
  if (question.id === 'itinerary_slot_placement_v1') {
    return '请选择极光观测日（点击下方日期按钮）';
  }
  const plain = String(question.question ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
}

/** 结构化澄清卡存在时：聊天气泡只用短 lead，完整正文仅在 clarificationQuestions 卡片内 */
export function resolveClarificationChatLead(question: ClarificationQuestion): string {
  if (question.id === 'itinerary_slot_placement_v1') {
    return '已识别为极光观测日选日，请在下方卡片中选择合适日期。';
  }
  const hint = String(question.hint ?? '').trim();
  if (hint && hint !== question.question) {
    return hint;
  }
  return resolveClarificationShortStepDetail(question);
}

export function renderPlainClarificationChatLeadHtml(text: string): string {
  const t = String(text ?? '').trim();
  return t ? `<p>${escapeHtml(t)}</p>` : '';
}

export function isStructuredClarificationChoiceCard(question: ClarificationQuestion | undefined): boolean {
  if (!question) return false;
  return (
    question.type === 'single_choice' &&
    Array.isArray(question.options) &&
    question.options.length > 0 &&
    String(question.metadata?.presentation ?? '') === 'structured_intake_v1'
  );
}
