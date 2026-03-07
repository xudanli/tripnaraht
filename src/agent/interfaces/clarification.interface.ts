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
 * 条件输入字段的类型（支持单选、多选等结构化输入）
 * multiple_choice 与 multi_choice 等价，前端兼容
 */
export type ConditionalInputType =
  | 'text'
  | 'single_choice'
  | 'multi_choice'
  | 'multiple_choice'
  | 'number'
  | 'date'
  | 'date_range';

/**
 * 🆕 HCI优化：条件输入字段配置
 * 当用户选择特定选项时，显示后续输入字段
 */
export interface ConditionalInputField {
  /** 触发此输入字段的选项值（与 options[].value 或 label 匹配） */
  triggerValue: string;
  /** 输入字段类型 */
  inputType: ConditionalInputType;
  /** 输入框标签，如「请选择旅行节奏」 */
  label?: string;
  /** single_choice / multiple_choice 时必填，格式：string[] 或 { value, label }[] */
  options?: (string | { value: string; label: string })[];
  /** 占位符（如 text 类型） */
  placeholder?: string;
  /** 辅助说明文案 */
  hint?: string;
  /** 是否必填，默认 true */
  required?: boolean;
  /** 验证规则 */
  validation?: ClarificationValidation;
  /**
   * 参数键名，提交时使用 {questionId}_{paramKey}，合并到 partialParams.preferences
   */
  paramKey?: string;
  /**
   * 确认提交按钮文案。当存在时，前端应为此条件输入渲染独立提交按钮，
   * 便于用户填写数字/日期等后明确确认（如「预算需要调整」+ 预算输入框 +「确认提交」）。
   */
  submitLabel?: string;
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
  /** 选项列表（用于 single_choice 和 multi_choice），支持 string[] 或 { value, label }[] */
  options?: (string | { value: string; label: string })[];
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
