"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SVALBARD_CONFIG_TEMPLATE = void 0;
const svalbard_personas_config_1 = require("./svalbard-personas.config");
exports.SVALBARD_CONFIG_TEMPLATE = {
    destinationCode: 'SJ',
    destinationName: '斯瓦尔巴',
    enabled: true,
    metadata: {
        description: '斯瓦尔巴特化澄清配置 - 极地生存体验，不是普通旅游',
        riskLevel: 'extreme',
        requiresExpertise: true,
        lastUpdated: '2026-01-31',
        credibilityScore: 0.91,
        dataSources: [
            'Visit Svalbard官方数据',
            '北极探险公司反馈',
            '极地向导安全记录',
            '用户体验研究'
        ],
    },
    userPersonas: svalbard_personas_config_1.SVALBARD_USER_PERSONAS,
    clarificationRounds: [
        {
            roundId: 'round_1_basic',
            name: '基础信息',
            description: '收集基础旅行信息：目的地、日期、预算',
            triggerConditions: {},
            questions: [],
            completionConditions: {
                requiredFields: ['destination', 'startDate', 'endDate', 'totalBudget'],
            },
            priority: 1,
        },
        {
            roundId: 'round_2_safety_gate',
            name: '安全预检 → 健康、年龄、风险理解',
            description: '早期发现不适合者 - 这是极地，不是普通旅游',
            triggerConditions: {
                requiredFields: ['destination'],
                previousRoundCompleted: 'round_1_basic',
            },
            questions: [
                {
                    id: 'sj_understands_extreme',
                    question: '你理解斯瓦尔巴是极地吗？这不是普通旅游。',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsExtreme',
                    },
                },
                {
                    id: 'sj_physical_condition',
                    question: '你的身体状况能否应对极端寒冷和高海拔？',
                    type: 'single_choice',
                    options: [
                        { value: 'excellent', label: '优秀（无健康问题）' },
                        { value: 'good', label: '良好（轻微问题，已控制）' },
                        { value: 'fair', label: '一般（有健康问题，需医生确认）' },
                        { value: 'poor', label: '较差（有严重健康问题）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'health',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'physicalCondition',
                    },
                },
                {
                    id: 'sj_extreme_experience',
                    question: '你曾在极端环境(零下温度、高海拔)中活动过吗？',
                    type: 'single_choice',
                    options: [
                        { value: 'yes_extensive', label: '有（冬季登山、北极探险等）' },
                        { value: 'yes_some', label: '有一些经验，但我准备充足' },
                        { value: 'no_first_time', label: '没有，这是我的第一次' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'extremeExperience',
                    },
                },
                {
                    id: 'sj_has_insurance',
                    question: '你是否购买了包含北极救援的保险？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'insurance',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'hasInsurance',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['understandsExtreme', 'physicalCondition', 'extremeExperience', 'hasInsurance'],
            },
            priority: 2,
        },
        {
            roundId: 'round_3_season_activities',
            name: '季节和活动偏好 → 现实匹配度检查',
            description: '确定季节的极端程度和活动风险级别',
            triggerConditions: {
                requiredFields: ['understandsExtreme', 'hasInsurance'],
                previousRoundCompleted: 'round_2_safety_gate',
            },
            questions: [
                {
                    id: 'sj_travel_season',
                    question: '你计划什么时候来？',
                    type: 'single_choice',
                    options: [
                        { value: 'summer', label: '夏季(6-8月，相对温和，24小时光线)' },
                        { value: 'transition', label: '过渡季(5月或9月，不稳定)' },
                        { value: 'polar_night', label: '极夜(10月-2月，完全黑暗和极端寒冷)' },
                    ],
                    required: true,
                    metadata: {
                        category: 'season',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'travelSeason',
                    },
                },
                {
                    id: 'sj_activity_types',
                    question: '你最想进行的活动是什么？',
                    type: 'single_choice',
                    options: [
                        { value: 'city_walking', label: '城市漫步和温和活动(低风险)' },
                        { value: 'boat_cultural', label: '船游和文化体验(中风险)' },
                        { value: 'glacier_wildlife', label: '冰川探险和北极熊追踪(高风险)' },
                        { value: 'multi_day_camping', label: '多日野外露营和极地穿越(极高风险)' },
                    ],
                    required: true,
                    metadata: {
                        category: 'activity',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'activityTypes',
                    },
                },
                {
                    id: 'sj_independent_experience',
                    question: '你独立完成过类似的极地/高海拔活动吗？',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'experience',
                        priority: 'medium',
                        fieldName: 'independentExperience',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['travelSeason', 'activityTypes'],
            },
            priority: 3,
        },
        {
            roundId: 'round_4_constraints',
            name: '实际约束 → 时间、预算、同伴、语言',
            description: '确认实际可行性',
            triggerConditions: {
                requiredFields: ['travelSeason', 'activityTypes'],
                previousRoundCompleted: 'round_3_season_activities',
            },
            questions: [
                {
                    id: 'sj_duration',
                    question: '你停留多久？',
                    type: 'single_choice',
                    options: [
                        { value: '1_2_days', label: '1-2天(极限，仅朗伊尔城)' },
                        { value: '3_5_days', label: '3-5天(合理，可体验多样活动)' },
                        { value: '6_10_days', label: '6-10天(充足，可深入探索)' },
                        { value: '10_plus_days', label: '10+天(研究或极地挑战)' },
                    ],
                    required: true,
                    metadata: {
                        category: 'duration',
                        priority: 'medium',
                        fieldName: 'duration',
                    },
                },
                {
                    id: 'sj_budget_reality',
                    question: '你的预算是多少？',
                    type: 'single_choice',
                    options: [
                        { value: 'under_1500', label: '低于1500 USD（不足）' },
                        { value: '1500_3000', label: '1500-3000 USD（最低）' },
                        { value: '3000_5000', label: '3000-5000 USD（合理）' },
                        { value: '5000_plus', label: '5000+ USD（充足）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'budget',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'budgetReality',
                    },
                },
                {
                    id: 'sj_travel_companions',
                    question: '你和谁一起旅行？',
                    type: 'single_choice',
                    options: [
                        { value: 'solo', label: '独自旅行' },
                        { value: 'partner', label: '伴侣/朋友' },
                        { value: 'family', label: '家庭（含儿童）' },
                        { value: 'group', label: '团队' },
                    ],
                    required: true,
                    metadata: {
                        category: 'companions',
                        priority: 'high',
                        fieldName: 'travelCompanions',
                    },
                },
                {
                    id: 'sj_language',
                    question: '你说英文吗？挪威文吗？',
                    type: 'single_choice',
                    options: [
                        { value: 'english_fluent', label: '流利英文' },
                        { value: 'english_basic', label: '基础英文' },
                        { value: 'norwegian', label: '挪威文' },
                        { value: 'neither', label: '都不会' },
                    ],
                    required: false,
                    metadata: {
                        category: 'language',
                        priority: 'medium',
                        fieldName: 'language',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['duration', 'budgetReality', 'travelCompanions'],
            },
            priority: 4,
        },
        {
            roundId: 'round_5_polar_understanding',
            name: '极地特定理解 → 北极熊、极夜、孤立感',
            description: '最终安全评估 - 用户是否真的理解极地风险',
            triggerConditions: {
                requiredFields: ['activityTypes', 'budgetReality'],
                previousRoundCompleted: 'round_4_constraints',
            },
            questions: [
                {
                    id: 'sj_understands_polar_bear',
                    question: '你理解北极熊的真实威胁吗？\n- 北极熊每年在斯瓦尔巴杀死0-2人\n- 法律要求在野外携带枪或有向导保护\n- 不能独自离开城镇\n- 遭遇北极熊的正确做法: 保持距离，不要逃跑，向导会处理',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'polar_bear_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsPolarBear',
                    },
                },
                {
                    id: 'sj_understands_polar_night',
                    question: '极夜会对你的心理产生什么影响？你准备好了吗？\n- 完全黑暗10小时/天(10月-2月中期)\n- 这导致失眠、抑郁和方向感丧失\n- 许多人无法适应，甚至在短期内\n- 没有"适应"期，就是要接受',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'polar_night_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsPolarNight',
                    },
                },
                {
                    id: 'sj_understands_isolation',
                    question: '你能接受孤立感吗？\n- 朗伊尔城人口2000人(不是城市)\n- 野外活动期间，你可能是唯一的游客\n- 医疗救援可能需要数小时\n- 通讯可能困难(卫星通讯器推荐)',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'isolation_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsIsolation',
                    },
                },
                {
                    id: 'sj_flexibility',
                    question: '如果你的行程被取消(天气原因)，你能适应吗？\n- 天气取消率: 夏季10%, 极夜40%+\n- 没有"固定"计划\n- 预定可能需要改期',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'flexibility',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'flexibility',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['understandsPolarBear', 'understandsPolarNight', 'understandsIsolation', 'flexibility'],
                allQuestionsAnswered: true,
            },
            priority: 5,
        },
        {
            roundId: 'round_6_final_gate',
            name: 'Should-Exist Gate → 用户是否真的应该来斯瓦尔巴？',
            description: '最终决策 - 这个用户现在应该去斯瓦尔巴吗？',
            triggerConditions: {
                requiredFields: ['understandsPolarBear', 'understandsPolarNight', 'understandsIsolation', 'flexibility'],
                previousRoundCompleted: 'round_5_polar_understanding',
            },
            questions: [
                {
                    id: 'sj_understands_real_risks',
                    question: '你理解来斯瓦尔巴的真正风险吗？这不是冰岛。风险是致命的，不是轻微的。',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsRealRisks',
                    },
                },
                {
                    id: 'sj_motivation',
                    question: '你为什么想来？是真正的热爱，还是被社交媒体炒作？',
                    type: 'text',
                    required: true,
                    metadata: {
                        category: 'motivation',
                        priority: 'high',
                        fieldName: 'motivation',
                    },
                },
                {
                    id: 'sj_three_dimensions_ready',
                    question: '你的体力、心理和财务状况都准备好了吗？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'readiness',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'threeDimensionsReady',
                    },
                },
                {
                    id: 'sj_has_alternatives',
                    question: '你是否有备选方案(如去冰岛或延期到来年)？',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'alternatives',
                        priority: 'medium',
                        fieldName: 'hasAlternatives',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['understandsRealRisks', 'motivation', 'threeDimensionsReady'],
                allQuestionsAnswered: true,
            },
            priority: 6,
        },
    ],
    gatePrechecks: [
        {
            checkId: 'sj_safety_gate_medical',
            name: '医学安全门',
            triggerConditions: {
                requiredFields: ['physicalCondition'],
                fieldConditions: [
                    {
                        fieldId: 'physicalCondition',
                        operator: 'equals',
                        value: 'poor',
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的健康状况是否适合极地环境。
如果 physicalCondition='poor'（有严重健康问题），则阻止。
如果用户有心脏病、呼吸系统疾病、未控制的高血压等，则阻止。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您的健康状况可能不适合极地环境。为了您的安全，我们强烈建议您咨询医生，或考虑其他目的地。',
                alternatives: [
                    {
                        label: '咨询医生后重新评估',
                        description: '如果医生确认可以，可以重新尝试',
                        action: 'consult_doctor',
                    },
                    {
                        label: '选择其他目的地',
                        description: '推荐：冰岛（风险较低）',
                        action: 'suggest_alternative:IS',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'sj_safety_gate_experience',
            name: '经验与活动匹配检查',
            triggerConditions: {
                requiredFields: ['extremeExperience', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'activityTypes',
                        operator: 'equals',
                        value: 'multi_day_camping',
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的极地经验是否与选择的活动匹配。
如果 activityTypes='multi_day_camping'（多日野外露营）但 extremeExperience='no_first_time'（无经验），则阻止。
如果 activityTypes='glacier_wildlife'（冰川探险）但 extremeExperience='no_first_time'，则警告。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您选择的活动需要极地经验，但您没有相关经验。为了您的安全，我们强烈建议您先选择较低风险的活动，或参加专业培训。',
                alternatives: [
                    {
                        label: '选择较低风险活动',
                        description: '推荐：城市漫步、船游和文化体验',
                        action: 'set_activity_types:city_walking,boat_cultural',
                    },
                    {
                        label: '参加极地培训后重新尝试',
                        description: '获得经验后再来',
                        action: 'suggest_training',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'sj_safety_gate_budget',
            name: '预算现实检查',
            triggerConditions: {
                requiredFields: ['budgetReality'],
                fieldConditions: [
                    {
                        fieldId: 'budgetReality',
                        operator: 'equals',
                        value: 'under_1500',
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: false,
                useRuleEngine: true,
                ruleExpression: 'budgetReality == "under_1500"',
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您的预算不足。斯瓦尔巴极度昂贵，每日最低成本150-200 USD，一周最少需要2000-3000 USD。',
                alternatives: [
                    {
                        label: '增加预算',
                        description: '建议预算至少2000-3000 USD',
                        action: 'increase_budget',
                    },
                    {
                        label: '选择其他目的地',
                        description: '推荐：冰岛（成本较低）',
                        action: 'suggest_alternative:IS',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'sj_safety_gate_solo',
            name: '独自旅行安全检查',
            triggerConditions: {
                requiredFields: ['travelCompanions', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'travelCompanions',
                        operator: 'equals',
                        value: 'solo',
                    },
                ],
            },
            checkType: 'soft_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查独自旅行是否安全。
如果 travelCompanions='solo'（独自旅行）且 activityTypes 包含任何野外活动，则警告。
斯瓦尔巴不建议独自旅行，特别是野外活动（北极熊威胁）。`,
            },
            failureResponse: {
                blockType: 'warning',
                warningMessage: '⚠️ 斯瓦尔巴不建议独自旅行，特别是野外活动（北极熊威胁）。强烈建议您与向导或团队一起旅行。',
                alternatives: [
                    {
                        label: '选择有向导的活动',
                        description: '所有野外活动必须有向导',
                        action: 'require_guide',
                    },
                    {
                        label: '仅进行城镇内活动',
                        description: '在朗伊尔城内活动相对安全',
                        action: 'set_activity_types:city_walking',
                    },
                ],
                additionalQuestions: [],
            },
        },
    ],
    fieldExtractionRules: [
        {
            fieldName: 'travelSeason',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取旅行季节：summer（夏季6-8月）、transition（过渡季5月或9月）、polar_night（极夜10月-2月）',
            validation: {
                required: false,
                enum: ['summer', 'transition', 'polar_night'],
            },
        },
        {
            fieldName: 'activityTypes',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取活动类型：city_walking（城市漫步）、boat_cultural（船游和文化）、glacier_wildlife（冰川和野生动物）、multi_day_camping（多日露营）',
            validation: {
                required: false,
                enum: ['city_walking', 'boat_cultural', 'glacier_wildlife', 'multi_day_camping'],
            },
        },
        {
            fieldName: 'physicalCondition',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取身体状况：excellent（优秀）、good（良好）、fair（一般）、poor（较差）',
            validation: {
                required: false,
                enum: ['excellent', 'good', 'fair', 'poor'],
            },
        },
        {
            fieldName: 'extremeExperience',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取极端环境经验：yes_extensive（有丰富经验）、yes_some（有一些经验）、no_first_time（无经验）',
            validation: {
                required: false,
                enum: ['yes_extensive', 'yes_some', 'no_first_time'],
            },
        },
    ],
};
//# sourceMappingURL=svalbard-clarification.config.js.map