/**
 * NL 推断字段与用户确认态 reconciler — 避免重复追问 confirm_inferred_info
 */

import { PHASE1_INFERRABLE_FIELDS } from '../config/planning-phases.config';

function hasConcreteValue(params: Record<string, any>, field: string): boolean {
  const v = params[field];
  return v != null && String(v).trim() !== '';
}

/** 用户自然语言确认阶段 1 推断信息（非结构化表单） */
export function isNlPhase1ConfirmText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 80) return false;
  if (/^(已确认|确认无误|确认|好的|没问题|正确|对的|可以|ok|confirm)$/i.test(t)) return true;
  if (/确认无误|信息正确|没问题|就是这样|对的没问题|可以没问题/.test(t) && t.length <= 50) return true;
  return false;
}

/**
 * 合并 partialParams 后：
 * - 已有明确值的推断字段从 inferredFields 移除
 * - 用户 NL 确认 → confirmInferred = confirm
 */
export function reconcileInferredFieldsFromUserInput(
  params: Record<string, any>,
  userText?: string,
): Record<string, any> {
  const out = { ...params };
  const inferred = Array.isArray(out.inferredFields) ? [...out.inferredFields] : [];

  const stillInferred = inferred.filter((field) => {
    if ((PHASE1_INFERRABLE_FIELDS as readonly string[]).includes(field)) {
      return !hasConcreteValue(out, field);
    }
    return true;
  });
  out.inferredFields = stillInferred.length ? stillInferred : undefined;

  const text = (userText || '').trim();
  if (text && isNlPhase1ConfirmText(text)) {
    out.confirmInferred = 'confirm';
    if (Array.isArray(out.inferredFields)) {
      out.inferredFields = out.inferredFields.filter(
        (f) => !(PHASE1_INFERRABLE_FIELDS as readonly string[]).includes(f),
      );
      if (!out.inferredFields.length) delete out.inferredFields;
    }
  }

  return out;
}
