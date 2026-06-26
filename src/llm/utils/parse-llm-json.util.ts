/**
 * Strip markdown JSON fences from LLM responses.
 * Handles preamble text, ```json / ``` wrappers, and trailing fences.
 */
export function stripLlmJsonMarkdown(raw: string): string {
  let s = raw.trim();
  const openRe = /```(?:json)?\s*\r?\n?/i;
  const m = openRe.exec(s);
  if (m) {
    const body = s.slice(m.index + m[0].length);
    const closeMatch = /\r?\n```/.exec(body);
    if (closeMatch) s = body.slice(0, closeMatch.index);
    else {
      const fallbackClose = body.lastIndexOf('```');
      s = fallbackClose > 0 ? body.slice(0, fallbackClose) : body;
    }
    s = s.trim();
  }
  return s.trim();
}

export function parseJsonFromLlmText(raw: string): unknown {
  const stripped = stripLlmJsonMarkdown(raw);
  try {
    return JSON.parse(stripped);
  } catch {
    const objStart = stripped.indexOf('{');
    const arrStart = stripped.indexOf('[');
    const start =
      objStart >= 0 && (arrStart < 0 || objStart < arrStart) ? objStart : arrStart;
    if (start < 0) throw new SyntaxError(`${stripped.slice(0, 40)}... is not valid JSON`);

    const isObject = stripped[start] === '{';
    const end = isObject ? stripped.lastIndexOf('}') : stripped.lastIndexOf(']');
    if (end <= start) throw new SyntaxError(`${stripped.slice(0, 40)}... is not valid JSON`);

    return JSON.parse(stripped.slice(start, end + 1));
  }
}
