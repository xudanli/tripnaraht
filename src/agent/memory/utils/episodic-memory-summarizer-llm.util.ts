/**
 * LLM 路径：情景 memory 摘要 prompt / 解析（State P3+）。
 */

export function parseEpisodicSummarizerLlmEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw =
    env.HARNESS_EPISODIC_SUMMARIZER_LLM ?? env.EPISODIC_SUMMARIZER_USE_LLM;
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function buildEpisodicSummarizerLlmPrompt(messages: readonly string[]): string {
  const transcript = messages
    .slice(-24)
    .map((m, i) => `${i + 1}. ${String(m ?? '').trim().slice(0, 400)}`)
    .join('\n');
  return [
    'You compress a travel-planning chat into a short episodic memory summary for the agent.',
    'Return JSON: {"summary":"..."}',
    'Rules: Chinese or match user language; max 400 chars; facts/decisions/constraints only; no tool names or policy JSON.',
    'Transcript:',
    transcript,
  ].join('\n');
}

export function parseEpisodicSummaryFromLlmJson(
  raw: string,
  maxChars = 900,
): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  try {
    const jsonStr = trimmed.startsWith('{')
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr) as { summary?: unknown };
    const summary = String(parsed.summary ?? '').trim();
    if (!summary) return null;
    return summary.slice(0, maxChars);
  } catch {
    return null;
  }
}
