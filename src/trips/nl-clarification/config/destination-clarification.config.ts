// src/trips/nl-clarification/config/destination-clarification.config.ts

/**
 * 目的地特化澄清配置系统
 * 
 * 支持为不同目的地配置特化的澄清问题和 Gate 预检查规则
 */

// 导入用户画像数据
import { GREENLAND_USER_PERSONAS } from './greenland-personas.config';
import { K2_USER_PERSONAS } from './k2-personas.config';
import { ALPS_USER_PERSONAS } from './alps-personas.config';
import { SVALBARD_USER_PERSONAS } from './svalbard-personas.config';

// 导入目的地配置模板
import { ALPS_CONFIG_TEMPLATE } from './alps-clarification.config';
import { SVALBARD_CONFIG_TEMPLATE } from './svalbard-clarification.config';

/**
 * 目的地澄清配置
 */
export interface DestinationClarificationConfig {
  /** 目的地代码（ISO 3166-1 alpha-2） */
  destinationCode: string;
  
  /** 目的地名称 */
  destinationName: string;
  
  /** 是否启用特化澄清（默认 false，向后兼容） */
  enabled: boolean;
  
  /** 澄清轮次配置 */
  clarificationRounds: ClarificationRound[];
  
  /** Should-Exist Gate 预检查配置 */
  gatePrechecks?: GatePrecheckConfig[];
  
  /** 字段提取规则（用于 LLM Prompt） */
  fieldExtractionRules?: FieldExtractionRule[];
  
  /** 元数据 */
  metadata?: {
    description?: string;
    riskLevel?: 'low' | 'medium' | 'high' | 'extreme';
    requiresExpertise?: boolean;
    lastUpdated?: string;
    dataSources?: string[];
    credibilityScore?: number;
  };
  
  /** 风险知识库（可选，用于存储详细的风险信息） */
  riskKnowledgeBase?: Record<string, any>;

  /** 用户画像系统（可选） */
  userPersonas?: {
    metadata?: {
      version?: string;
      last_updated?: string;
      description?: string;
      credibility_score?: number;
      language?: string;
    };
    overview?: {
      purpose?: string;
      philosophy?: string;
    };
    user_personas?: Array<{
      persona_id: string;
      persona_name: string;
      persona_name_en?: string;
      percentage_of_visitors?: string;
      characteristics?: Record<string, any>;
      recommended_routes?: Array<{
        route: string;
        reason?: string;
        difficulty_match?: string;
        prerequisites?: string[];
      }>;
      not_recommended?: string[];
      preparation_needs?: string[];
      expected_experiences?: Record<string, any>;
      typical_itinerary?: Record<string, string>;
      success_factors?: string[];
      [key: string]: any;
    }>;
    persona_assessment_tool?: {
      how_to_use?: string;
      questions?: Array<Record<string, any>>;
    };
    cross_persona_advice?: Record<string, any>;
    ai_decision_logic?: Record<string, any>;
    red_flags?: {
      medical?: string[];
      psychological?: string[];
      practical?: string[];
      safety?: string[];
    };
    decision_matrix?: Record<string, any>;
    data_provenance?: Record<string, any>;
  };
}

/**
 * 澄清轮次
 */
export interface ClarificationRound {
  /** 轮次ID */
  roundId: string;
  
  /** 轮次名称（用于日志和调试） */
  name: string;
  
  /** 轮次描述（用于 LLM Prompt） */
  description: string;
  
  /** 触发条件（何时进入此轮次） */
  triggerConditions: {
    /** 必需的基础字段（必须已提取） */
    requiredFields?: string[];
    /** 可选：上一轮次必须完成 */
    previousRoundCompleted?: string;
  };
  
  /** 问题列表 */
  questions: ClarificationQuestionDef[];
  
  /** 完成条件（何时可以进入下一轮） */
  completionConditions: {
    /** 必需字段列表 */
    requiredFields: string[];
    /** 可选：所有问题已回答 */
    allQuestionsAnswered?: boolean;
  };
  
  /** 优先级（数字越小越优先） */
  priority: number;
}

/**
 * 澄清问题定义
 */
export interface ClarificationQuestionDef {
  /** 问题ID（唯一标识） */
  id: string;
  
  /** 问题文本（支持模板变量，如 {{destination}}） */
  question: string;
  
  /** 问题类型 */
  type: 'text' | 'single_choice' | 'multi_choice' | 'date' | 'number' | 'boolean';
  
  /** 选项列表（用于 single_choice 和 multi_choice） */
  options?: Array<{
    value: string;
    label: string;
    /** 选择此选项时的后续动作 */
    actions?: QuestionAction[];
  }>;
  
  /** 是否必填 */
  required: boolean;
  
  /** 提示文本 */
  hint?: string;
  
  /** 占位符（用于 text 和 number） */
  placeholder?: string;
  
  /** 默认值 */
  default?: string | string[] | boolean | number;
  
  /** 验证规则 */
  validation?: {
    /** 最小值（number） */
    min?: number;
    /** 最大值（number） */
    max?: number;
    /** 正则表达式（text） */
    pattern?: string;
    /** 自定义验证函数名 */
    customValidator?: string;
  };
  
  /** 依赖规则（依赖其他字段的值） */
  dependencies?: Array<{
    /** 依赖的字段ID */
    fieldId: string;
    /** 依赖的值（如果字段值等于此值，则显示此问题） */
    value: any;
  }>;
  
  /** 元数据 */
  metadata?: {
    category?: string;
    priority?: 'high' | 'medium' | 'low';
    /** 是否 Critical（Critical 问题未回答时不能创建行程） */
    isCritical?: boolean;
    /** 字段名（用于存储到 partialParams） */
    fieldName?: string;
  };
  
  /** 后续动作（用户回答后） */
  actions?: QuestionAction[];
}

/**
 * 问题动作
 */
export interface QuestionAction {
  /** 动作类型 */
  type: 'set_field' | 'trigger_gate' | 'show_warning' | 'hide_question' | 'show_question';
  
  /** 动作参数 */
  params: Record<string, any>;
}

/**
 * Gate 预检查配置
 */
export interface GatePrecheckConfig {
  /** 预检查ID */
  checkId: string;
  
  /** 检查名称 */
  name: string;
  
  /** 触发条件（何时执行此检查） */
  triggerConditions: {
    /** 必需字段 */
    requiredFields: string[];
    /** 字段值条件（可选） */
    fieldConditions?: Array<{
      fieldId: string;
      operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';
      value: any;
    }>;
  };
  
  /** 检查类型 */
  checkType: 'hard_gate' | 'soft_gate' | 'warning';
  
  /** 检查逻辑（LLM Prompt 或 规则引擎） */
  checkLogic: {
    /** 使用 LLM 检查 */
    useLLM?: boolean;
    /** LLM Prompt 模板 */
    llmPrompt?: string;
    /** 使用规则引擎 */
    useRuleEngine?: boolean;
    /** 规则表达式 */
    ruleExpression?: string;
  };
  
  /** 失败时的响应 */
  failureResponse: {
    /** 阻止类型 */
    blockType: 'block' | 'warning' | 'require_confirmation';
    /** 警告消息 */
    warningMessage: string;
    /** 建议的替代方案 */
    alternatives?: Array<{
      label: string;
      description: string;
      action?: string;
    }>;
    /** 需要补充的澄清问题 */
    additionalQuestions?: ClarificationQuestionDef[];
  };
}

/**
 * 字段提取规则
 */
export interface FieldExtractionRule {
  /** 字段名（用于存储到 partialParams） */
  fieldName: string;
  
  /** 字段类型 */
  fieldType: 'string' | 'number' | 'boolean' | 'array' | 'object';
  
  /** 提取规则（LLM Prompt 片段） */
  extractionPrompt: string;
  
  /** 验证规则 */
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
  
  /** 默认值（如果无法提取） */
  defaultValue?: any;
}

/**
 * Gate 预检查结果
 */
export interface GatePrecheckResult {
  /** 是否被阻止 */
  blocked: boolean;
  /** 检查ID（如果被阻止） */
  checkId?: string;
  /** 警告消息 */
  warningMessage?: string;
  /** 替代方案 */
  alternatives?: Array<{
    label: string;
    description: string;
    action?: string;
  }>;
  /** 需要补充的澄清问题 */
  additionalQuestions?: ClarificationQuestionDef[];
}

/**
 * 格陵兰配置模板（示例）
 */
export const GREENLAND_CONFIG_TEMPLATE: DestinationClarificationConfig = {
  destinationCode: 'GL',
  destinationName: '格陵兰',
  enabled: true,
  metadata: {
    description: '格陵兰特化澄清配置 - 极地探险目的地',
    riskLevel: 'extreme',
    requiresExpertise: true,
    lastUpdated: '2026-01-31',
    credibilityScore: 0.93,
  },
  userPersonas: GREENLAND_USER_PERSONAS,
  clarificationRounds: [
    {
      roundId: 'round_1_basic',
      name: '基础信息',
      description: '收集基础旅行信息',
      triggerConditions: {},
      questions: [
        // 基础问题由通用流程处理，这里可以为空或添加特化问题
      ],
      completionConditions: {
        requiredFields: ['destination', 'startDate', 'endDate', 'totalBudget', 'currency'],
      },
      priority: 1,
    },
    {
      roundId: 'round_2_experience',
      name: '体验偏好',
      description: '了解用户的极地探险经验和风险承受度',
      triggerConditions: {
        requiredFields: ['destination'],
        previousRoundCompleted: 'round_1_basic',
      },
      questions: [
        {
          id: 'gl_experience_level',
          question: '您的极地探险经验水平是？',
          type: 'single_choice',
          options: [
            { value: 'first_timer', label: '无极地经验' },
            { value: 'enthusiast', label: '有1-2次北极/高山经验' },
            { value: 'expert', label: '多次极地/专业探险经验' },
          ],
          required: true,
          metadata: {
            category: 'experience',
            priority: 'high',
            isCritical: true,
            fieldName: 'experienceLevel',
          },
        },
        {
          id: 'gl_risk_tolerance',
          question: '您能接受的风险等级是？',
          type: 'single_choice',
          options: [
            { value: 'low', label: '仅接受低风险（伊卢利萨特船游）' },
            { value: 'medium', label: '接受中等风险（迪斯科湾皮划艇）' },
            { value: 'high', label: '接受高风险（冰川徒步、远程活动）' },
            { value: 'extreme', label: '接受致命风险（东格陵兰远征）' },
          ],
          required: true,
          metadata: {
            category: 'risk',
            priority: 'high',
            isCritical: true,
            fieldName: 'riskTolerance',
          },
        },
        {
          id: 'gl_activity_types',
          question: '您最想进行的活动类型是？（可多选）',
          type: 'multi_choice',
          options: [
            { value: 'boat_tour', label: '船游（伊卢利萨特）' },
            { value: 'kayaking', label: '皮划艇（迪斯科湾）' },
            { value: 'glacier_hiking', label: '冰川徒步' },
            { value: 'ice_sheet_expedition', label: '冰盖远征' },
            { value: 'east_greenland_expedition', label: '东格陵兰远征' },
          ],
          required: true,
          metadata: {
            category: 'activity',
            priority: 'high',
            fieldName: 'activityTypes',
          },
        },
      ],
      completionConditions: {
        requiredFields: ['experienceLevel', 'riskTolerance', 'activityTypes'],
      },
      priority: 2,
    },
    {
      roundId: 'round_3_details',
      name: '细节确认',
      description: '确认住宿、装备、保险等细节',
      triggerConditions: {
        requiredFields: ['experienceLevel', 'riskTolerance'],
        previousRoundCompleted: 'round_2_experience',
      },
      questions: [
        {
          id: 'gl_accommodation_preference',
          question: '您的住宿偏好是？',
          type: 'single_choice',
          options: [
            { value: 'hotel', label: '酒店' },
            { value: 'homestay', label: '民宿/家庭旅馆' },
            { value: 'camping', label: '露营' },
          ],
          required: true,
          metadata: {
            category: 'accommodation',
            priority: 'high',
            isCritical: true,
            fieldName: 'accommodationPreference',
          },
          dependencies: [
            {
              fieldId: 'activityTypes',
              value: 'east_greenland_expedition',
            },
          ],
        },
        {
          id: 'gl_has_equipment',
          question: '您是否自备极地装备（防寒服、睡袋等）？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'equipment',
            priority: 'high',
            isCritical: true,
            fieldName: 'hasEquipment',
          },
        },
        {
          id: 'gl_budget_priority',
          question: '您的预算优先级是？',
          type: 'single_choice',
          options: [
            { value: 'experience', label: '体验优先（愿意为独特体验付费）' },
            { value: 'cost', label: '成本优先（寻找性价比最高的方案）' },
            { value: 'safety', label: '安全优先（愿意为安全保障付费）' },
            { value: 'balanced', label: '平衡（综合考虑）' },
          ],
          required: false,
          metadata: {
            category: 'budget',
            priority: 'medium',
            fieldName: 'budgetPriority',
          },
        },
      ],
      completionConditions: {
        requiredFields: ['accommodationPreference', 'hasEquipment'],
      },
      priority: 3,
    },
    {
      roundId: 'round_4_gate',
      name: 'Should-Exist Gate',
      description: '最终安全确认和知情同意',
      triggerConditions: {
        requiredFields: ['experienceLevel', 'riskTolerance', 'accommodationPreference', 'hasEquipment'],
        previousRoundCompleted: 'round_3_details',
      },
      questions: [
        {
          id: 'gl_understands_risks',
          question: '您是否理解以下真实风险：\n1. 北极熊遭遇概率（东格陵兰50%+）\n2. 失温危险（水温2-8°C，存活15-20分钟）\n3. 救援延迟（某些地区24-72小时）\n4. 冰川危险（冰山崩解、裂缝）\n5. 极端天气（白风、焚风、极温）',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'risk_understanding',
            priority: 'high',
            isCritical: true,
            fieldName: 'understandsRisks',
          },
        },
        {
          id: 'gl_has_insurance',
          question: '您是否有极地级旅行保险？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'insurance',
            priority: 'high',
            isCritical: true,
            fieldName: 'hasInsurance',
          },
        },
        {
          id: 'gl_gives_consent',
          question: '您确认已充分了解风险，并同意在知情的情况下继续规划此行程？',
          type: 'boolean',
          required: true,
          metadata: {
            category: 'consent',
            priority: 'high',
            isCritical: true,
            fieldName: 'givesConsent',
          },
        },
      ],
      completionConditions: {
        requiredFields: ['understandsRisks', 'hasInsurance', 'givesConsent'],
        allQuestionsAnswered: true,
      },
      priority: 4,
    },
  ],
  gatePrechecks: [
    {
      checkId: 'gl_experience_activity_match',
      name: '经验与活动匹配检查',
      triggerConditions: {
        requiredFields: ['experienceLevel', 'riskTolerance', 'activityTypes'],
        fieldConditions: [
          {
            fieldId: 'riskTolerance',
            operator: 'equals',
            value: 'extreme',
          },
        ],
      },
      checkType: 'hard_gate',
      checkLogic: {
        useLLM: true,
        llmPrompt: `检查用户的极地经验水平是否与选择的风险等级匹配。
如果 riskTolerance='extreme' 但 experienceLevel='first_timer'，则阻止。
如果 activityTypes 包含 'east_greenland_expedition' 但 experienceLevel='first_timer'，则阻止。`,
      },
      failureResponse: {
        blockType: 'block',
        warningMessage: '⚠️ 您选择的是极端风险活动，但您没有极地探险经验。为了您的安全，我们强烈建议您先选择较低风险的活动。',
        alternatives: [
          {
            label: '选择中等风险活动',
            description: '推荐：迪斯科湾皮划艇、伊卢利萨特冰川船游',
            action: 'set_risk_tolerance:medium',
          },
        ],
        additionalQuestions: [],
      },
    },
  ],
  fieldExtractionRules: [
    {
      fieldName: 'experienceLevel',
      fieldType: 'string',
      extractionPrompt: '从用户描述中提取极地探险经验水平：first_timer（无极地经验）、enthusiast（有1-2次北极/高山经验）、expert（多次极地/专业探险经验）',
      validation: {
        required: false,
        enum: ['first_timer', 'enthusiast', 'expert'],
      },
    },
    {
      fieldName: 'riskTolerance',
      fieldType: 'string',
      extractionPrompt: '从用户描述中提取风险承受度：low（仅接受低风险）、medium（接受中等风险）、high（接受高风险）、extreme（接受致命风险）',
      validation: {
        required: false,
        enum: ['low', 'medium', 'high', 'extreme'],
      },
    },
  ],
};

/**
 * 导出冰岛配置（从单独文件导入）
 */
export { ICELAND_CONFIG_TEMPLATE } from './iceland-clarification.config';

/**
 * 导出格陵兰用户画像（从单独文件导入）
 */
export { GREENLAND_USER_PERSONAS } from './greenland-personas.config';

/**
 * 导出K2用户画像（从单独文件导入）
 */
export { K2_USER_PERSONAS } from './k2-personas.config';

/**
 * 导出阿尔卑斯用户画像（从单独文件导入）
 */
export { ALPS_USER_PERSONAS } from './alps-personas.config';

/**
 * 导出阿尔卑斯配置（从单独文件导入）
 */
export { ALPS_CONFIG_TEMPLATE } from './alps-clarification.config';

/**
 * 导出斯瓦尔巴用户画像（从单独文件导入）
 */
export { SVALBARD_USER_PERSONAS } from './svalbard-personas.config';

/**
 * 导出斯瓦尔巴配置（从单独文件导入）
 */
export { SVALBARD_CONFIG_TEMPLATE } from './svalbard-clarification.config';

/**
 * 导出K2配置（从单独文件导入）
 */
export { K2_CONFIG_TEMPLATE } from './k2-clarification.config';

/**
 * 导出西藏配置（从单独文件导入）
 */
export { TIBET_CONFIG_TEMPLATE } from './tibet-clarification.config';

/**
 * 导出罗弗敦配置（从单独文件导入）
 */
export { LOFOTEN_CONFIG_TEMPLATE } from './lofoten-clarification.config';
