import { z } from 'zod';
import type {
  ClarificationQuestion,
  ConditionalInputField,
} from '../interfaces/clarification.interface';

const ClarificationOptionSchema = z.union([
  z.string(),
  z.object({
    value: z.string(),
    label: z.string(),
  }),
]);

const ClarificationValidationSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  })
  .optional();

export const ConditionalInputFieldSchema = z.object({
  triggerValue: z.string().min(1),
  inputType: z.enum([
    'text',
    'single_choice',
    'multi_choice',
    'multiple_choice',
    'number',
    'date',
    'date_range',
  ]),
  label: z.string().optional(),
  options: z.array(ClarificationOptionSchema).optional(),
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  required: z.boolean().optional(),
  validation: ClarificationValidationSchema,
  paramKey: z.string().optional(),
  submitLabel: z.string().optional(),
});

export const ClarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  question_html: z.string().optional(),
  type: z.enum(['text', 'single_choice', 'multi_choice', 'date', 'number']),
  options: z.array(ClarificationOptionSchema).optional(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  default: z.union([z.string(), z.array(z.string())]).optional(),
  validation: ClarificationValidationSchema,
  conditionalInputs: z.array(ConditionalInputFieldSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ClarificationQuestionsSchema = z.array(ClarificationQuestionSchema);

function normalizeConditionalInput(raw: ConditionalInputField): ConditionalInputField {
  const inputType =
    raw.inputType === 'multiple_choice' ? 'multi_choice' : raw.inputType;
  return { ...raw, inputType };
}

/** 丢弃非法字段/条目，保留可渲染的澄清卡结构 */
export function parseClarificationQuestionsForClient(
  questions: unknown,
): ClarificationQuestion[] {
  const coerced = coerceLegacyClarificationQuestions(questions);
  const parsed = ClarificationQuestionsSchema.safeParse(coerced);
  if (!parsed.success) {
    if (!Array.isArray(coerced)) return [];
    const out: ClarificationQuestion[] = [];
    for (const item of coerced) {
      const one = ClarificationQuestionSchema.safeParse(item);
      if (one.success) out.push(one.data as ClarificationQuestion);
    }
    return out.map((q) => ({
      ...q,
      conditionalInputs: q.conditionalInputs?.map(normalizeConditionalInput),
    }));
  }
  return parsed.data.map((q) => ({
    ...q,
    conditionalInputs: q.conditionalInputs?.map(normalizeConditionalInput),
  })) as ClarificationQuestion[];
}

/**
 * 兼容 REPAIR 等历史形状：`type: NEED_CONFIRMATION`、`options: [{ id, label }]`。
 * 未归一化时 Zod 会丢弃整张卡，前端退化成空白 text 输入。
 */
function coerceLegacyClarificationQuestions(questions: unknown): unknown {
  if (!Array.isArray(questions)) return questions;
  return questions.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const q = item as Record<string, unknown>;
    const rawType = String(q.type ?? '');
    const type =
      rawType === 'NEED_CONFIRMATION' || rawType === 'NEED_MORE_INFO'
        ? 'single_choice'
        : q.type;

    let options = q.options;
    if (Array.isArray(options)) {
      options = options.map((opt) => {
        if (typeof opt === 'string') return opt;
        if (!opt || typeof opt !== 'object') return opt;
        const o = opt as Record<string, unknown>;
        if (typeof o.value === 'string' && o.value.trim()) {
          return {
            value: o.value.trim(),
            label: String(o.label ?? o.value).trim() || o.value.trim(),
          };
        }
        if (typeof o.id === 'string' && o.id.trim()) {
          return {
            value: o.id.trim(),
            label: String(o.label ?? o.id).trim() || o.id.trim(),
          };
        }
        return opt;
      });
    }

    const hasChoiceOptions = Array.isArray(options) && options.length > 0;
    const metadata =
      q.metadata && typeof q.metadata === 'object'
        ? { ...(q.metadata as Record<string, unknown>) }
        : {};
    if (hasChoiceOptions && type === 'single_choice' && !metadata.presentation) {
      metadata.presentation = 'structured_intake_v1';
    }

    return {
      ...q,
      type,
      ...(options !== undefined ? { options } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {}),
    };
  });
}
