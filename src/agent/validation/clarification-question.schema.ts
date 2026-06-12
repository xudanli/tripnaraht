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
  const parsed = ClarificationQuestionsSchema.safeParse(questions);
  if (!parsed.success) {
    if (!Array.isArray(questions)) return [];
    const out: ClarificationQuestion[] = [];
    for (const item of questions) {
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
