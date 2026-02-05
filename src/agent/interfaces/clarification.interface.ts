// src/agent/interfaces/clarification.interface.ts

/**
 * 澄清问题类型
 */
export type ClarificationQuestionType = 
  | 'text'           // 文本输入
  | 'single_choice'  // 单选
  | 'multi_choice'   // 多选
  | 'date'           // 日期选择
  | 'number';        // 数字输入

/**
 * 验证规则
 * 
 * 注意：
 * - 对于 `number` 类型：min/max 为数值
 * - 对于 `date` 类型：min/max 为时间戳（number，毫秒）
 * - 对于 `text` 类型：pattern 为正则表达式字符串
 */
export interface ClarificationValidation {
  /** 最小值（用于 number 和 date，date 类型使用时间戳） */
  min?: number;
  /** 最大值（用于 number 和 date，date 类型使用时间戳） */
  max?: number;
  /** 正则表达式（用于 text） */
  pattern?: string;
}

/**
 * 🆕 HCI优化：条件输入字段配置
 * 当用户选择特定选项时，显示后续输入字段
 */
export interface ConditionalInputField {
  /** 触发此输入字段的选项值（当用户选择此选项时显示输入字段） */
  triggerValue: string;
  /** 输入字段类型 */
  inputType: 'text' | 'date' | 'number' | 'date_range';
  /** 输入字段标签 */
  label?: string;
  /** 占位符 */
  placeholder?: string;
  /** 是否必填 */
  required?: boolean;
  /** 验证规则 */
  validation?: ClarificationValidation;
  /** 提示文本 */
  hint?: string;
}

/**
 * 澄清问题数据结构
 * 
 * 用于在用户输入信息不足时，通过结构化问题收集必要信息
 */
export interface ClarificationQuestion {
  /** 问题 ID（唯一标识） */
  id: string;
  /** 问题文本（用户看到的问题） */
  question: string;
  /** 问题类型 */
  type: ClarificationQuestionType;
  /** 选项列表（用于 single_choice 和 multi_choice） */
  options?: string[];
  /** 是否必填 */
  required: boolean;
  /** 占位符（用于 text 和 number） */
  placeholder?: string;
  /** 提示文本（帮助用户理解问题） */
  hint?: string;
  /** 默认值 */
  default?: string | string[];
  /** 验证规则（可选） */
  validation?: ClarificationValidation;
  /** 🆕 HCI优化：条件输入字段（当用户选择特定选项时显示后续输入字段） */
  conditionalInputs?: ConditionalInputField[];
}

/**
 * 澄清问题回答
 */
export interface ClarificationAnswer {
  /** 问题 ID（关联 ClarificationQuestion.id） */
  questionId: string;
  /** 回答值 */
  value: string | string[] | number | null;
}
