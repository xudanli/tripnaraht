"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ICELAND_CONFIG_TEMPLATE = void 0;
exports.ICELAND_CONFIG_TEMPLATE = {
    destinationCode: 'IS',
    destinationName: '冰岛',
    enabled: true,
    metadata: {
        description: '冰岛特化澄清配置 - 基于用户人物设定和分层澄清策略',
        riskLevel: 'medium',
        requiresExpertise: false,
        lastUpdated: '2026-01-31',
        dataSources: [
            '冰岛旅游局用户数据',
            '旅游平台用户分析',
            '本地向导反馈',
            '社交媒体旅行分享'
        ],
        credibilityScore: 0.89,
    },
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
            roundId: 'round_2_experience',
            name: '体验偏好',
            description: '了解用户的旅行类型、活动偏好和风险承受度',
            triggerConditions: {
                requiredFields: ['destination'],
                previousRoundCompleted: 'round_1_basic',
            },
            questions: [
                {
                    id: 'is_travel_season',
                    question: '你计划什么时候来冰岛？',
                    type: 'single_choice',
                    options: [
                        { value: 'winter', label: '冬季（11月-3月，极光季）' },
                        { value: 'summer', label: '夏季（6月-8月，午夜太阳）' },
                        { value: 'spring_autumn', label: '春秋（4月-5月或9月-10月，过渡季）' },
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
                    id: 'is_activity_preference',
                    question: '你最感兴趣的活动是什么？',
                    type: 'multi_choice',
                    options: [
                        { value: 'aurora_hunting', label: '极光摄影和追踪' },
                        { value: 'glacier_hiking', label: '冰川徒步和冰洞探险' },
                        { value: 'scenic_photography', label: '风景摄影' },
                        { value: 'hot_springs', label: '温泉和放松' },
                        { value: 'nature_exploration', label: '自然探索（任何类型）' },
                        { value: 'adventure_activities', label: '冒险活动（火山、峡谷漂流）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'activity',
                        priority: 'high',
                        fieldName: 'activityPreferences',
                    },
                },
                {
                    id: 'is_risk_tolerance',
                    question: '你的风险承受度是什么？',
                    type: 'single_choice',
                    options: [
                        { value: 'low', label: '低（安全舒适为主）' },
                        { value: 'medium', label: '中等（愿意冒一些风险）' },
                        { value: 'high', label: '高（追求刺激）' },
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
                    id: 'is_travel_group',
                    question: '你和谁一起旅行？',
                    type: 'single_choice',
                    options: [
                        { value: 'solo', label: '独旅' },
                        { value: 'couple', label: '情侣' },
                        { value: 'friends', label: '朋友小队' },
                        { value: 'family', label: '家庭（含儿童）' },
                        { value: 'group', label: '团队或小组' },
                    ],
                    required: true,
                    metadata: {
                        category: 'group',
                        priority: 'high',
                        fieldName: 'travelGroup',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['travelSeason', 'activityPreferences', 'riskTolerance', 'travelGroup'],
            },
            priority: 2,
        },
        {
            roundId: 'round_3_details',
            name: '细节确认',
            description: '确认同行人员、驾驶经验、装备、保险等细节',
            triggerConditions: {
                requiredFields: ['travelSeason', 'activityPreferences', 'riskTolerance'],
                previousRoundCompleted: 'round_2_experience',
            },
            questions: [
                {
                    id: 'is_winter_driving_experience',
                    question: '你有冬季驾驶经验吗？',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'driving',
                        priority: 'high',
                        fieldName: 'hasWinterDrivingExperience',
                    },
                    dependencies: [
                        {
                            fieldId: 'travelSeason',
                            value: 'winter',
                        },
                    ],
                },
                {
                    id: 'is_highland_driving_experience',
                    question: '你有高地驾驶经验吗？（F-roads需4WD）',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'driving',
                        priority: 'high',
                        fieldName: 'hasHighlandDrivingExperience',
                    },
                    dependencies: [
                        {
                            fieldId: 'activityPreferences',
                            value: 'adventure_activities',
                        },
                    ],
                },
                {
                    id: 'is_physical_fitness',
                    question: '你的体力和年龄适合户外活动吗？',
                    type: 'single_choice',
                    options: [
                        { value: 'excellent', label: '优秀（可以完成高强度活动）' },
                        { value: 'good', label: '良好（可以完成中等强度活动）' },
                        { value: 'moderate', label: '一般（只能完成低强度活动）' },
                        { value: 'limited', label: '有限（需要特别安排）' },
                    ],
                    required: false,
                    metadata: {
                        category: 'fitness',
                        priority: 'medium',
                        fieldName: 'physicalFitness',
                    },
                    dependencies: [
                        {
                            fieldId: 'activityPreferences',
                            value: 'glacier_hiking',
                        },
                    ],
                },
                {
                    id: 'is_has_insurance',
                    question: '你购买了旅游保险吗？',
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
                    id: 'is_equipment_ready',
                    question: '你的装备能否应对极端天气？',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'equipment',
                        priority: 'medium',
                        fieldName: 'hasEquipment',
                    },
                    dependencies: [
                        {
                            fieldId: 'travelSeason',
                            value: 'winter',
                        },
                    ],
                },
            ],
            completionConditions: {
                requiredFields: ['hasInsurance'],
            },
            priority: 3,
        },
        {
            roundId: 'round_4_gate',
            name: 'Should-Exist Gate',
            description: '最终安全确认和风险理解',
            triggerConditions: {
                requiredFields: ['travelSeason', 'activityPreferences', 'riskTolerance', 'hasInsurance'],
                previousRoundCompleted: 'round_3_details',
            },
            questions: [
                {
                    id: 'is_understands_weather',
                    question: '你理解冰岛的极端天气吗？\n- 突然风暴\n- 零下低温\n- 能见度差\n- 道路危险',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsWeather',
                    },
                },
                {
                    id: 'is_understands_aurora',
                    question: '你理解极光不是100%保证的吗？即使最好的条件也可能看不到。',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        fieldName: 'understandsAurora',
                    },
                    dependencies: [
                        {
                            fieldId: 'travelSeason',
                            value: 'winter',
                        },
                        {
                            fieldId: 'activityPreferences',
                            value: 'aurora_hunting',
                        },
                    ],
                },
                {
                    id: 'is_emergency_prepared',
                    question: '你为应急做好准备了吗？\n- 直升机救援成本高（ISK 500k+）\n- 是否有足够保险？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'emergency',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'emergencyPrepared',
                    },
                },
                {
                    id: 'is_travel_motivation',
                    question: '你的动机是什么？是真正的热爱，还是被社交媒体影响？',
                    type: 'single_choice',
                    options: [
                        { value: 'genuine_interest', label: '真正的热爱和兴趣' },
                        { value: 'social_media', label: '被社交媒体影响' },
                        { value: 'bucket_list', label: '人生清单项目' },
                        { value: 'other', label: '其他原因' },
                    ],
                    required: false,
                    metadata: {
                        category: 'motivation',
                        priority: 'medium',
                        fieldName: 'travelMotivation',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['understandsWeather', 'emergencyPrepared'],
                allQuestionsAnswered: true,
            },
            priority: 4,
        },
    ],
    gatePrechecks: [
        {
            checkId: 'is_season_activity_match',
            name: '季节与活动匹配检查',
            triggerConditions: {
                requiredFields: ['travelSeason', 'activityPreferences'],
                fieldConditions: [
                    {
                        fieldId: 'travelSeason',
                        operator: 'equals',
                        value: 'summer',
                    },
                    {
                        fieldId: 'activityPreferences',
                        operator: 'in',
                        value: ['aurora_hunting'],
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的季节和活动偏好是否匹配。
如果 travelSeason='summer'（6-8月）但 activityPreferences 包含 'aurora_hunting'（极光追踪），则阻止。
原因：夏季6-8月是午夜太阳季节，没有极光。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您选择的是夏季（6-8月），但想进行极光追踪。夏季是午夜太阳季节，没有极光。建议选择冬季（11月-3月）或调整活动偏好。',
                alternatives: [
                    {
                        label: '选择冬季（极光季）',
                        description: '推荐：11月-3月，极光概率最高',
                        action: 'set_travel_season:winter',
                    },
                    {
                        label: '调整活动偏好',
                        description: '推荐：夏季可以体验午夜太阳、冰川徒步、高地探险',
                        action: 'set_activity_preferences:glacier_hiking,scenic_photography',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'is_budget_season_match',
            name: '预算与季节匹配检查',
            triggerConditions: {
                requiredFields: ['totalBudget', 'travelSeason'],
                fieldConditions: [
                    {
                        fieldId: 'travelSeason',
                        operator: 'equals',
                        value: 'winter',
                    },
                ],
            },
            checkType: 'soft_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的预算是否适合冬季旅行。
如果 travelSeason='winter' 但 totalBudget < 1500（美元），则警告。
原因：冬季需要更多保暖装备、活动费用高、可能因天气取消。`,
            },
            failureResponse: {
                blockType: 'warning',
                warningMessage: '⚠️ 冬季旅行需要更多预算（保暖装备、活动费用、可能的取消）。建议预算至少 $1500，或考虑夏季旅行。',
                alternatives: [
                    {
                        label: '增加预算',
                        description: '推荐：至少 $1500 以确保舒适和安全',
                        action: 'increase_budget:1500',
                    },
                    {
                        label: '选择夏季',
                        description: '推荐：夏季天气更好，成本相对较低',
                        action: 'set_travel_season:summer',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'is_winter_driving_safety',
            name: '冬季驾驶安全检查',
            triggerConditions: {
                requiredFields: ['travelSeason', 'hasWinterDrivingExperience'],
                fieldConditions: [
                    {
                        fieldId: 'travelSeason',
                        operator: 'equals',
                        value: 'winter',
                    },
                    {
                        fieldId: 'hasWinterDrivingExperience',
                        operator: 'equals',
                        value: false,
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户是否有冬季驾驶经验。
如果 travelSeason='winter' 但 hasWinterDrivingExperience=false，则阻止自驾。
原因：冰岛冬季道路危险，需要经验。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您计划冬季自驾，但没有冬季驾驶经验。冰岛冬季道路非常危险（冰面、暴风雪、能见度差）。强烈建议选择跟团或租赁带司机的车辆。',
                alternatives: [
                    {
                        label: '选择跟团游',
                        description: '推荐：专业导游，安全可靠',
                        action: 'set_travel_mode:guided_tour',
                    },
                    {
                        label: '租赁带司机的车辆',
                        description: '推荐：有经验的本地司机',
                        action: 'set_travel_mode:chauffeur',
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
            extractionPrompt: `从用户描述中提取旅行季节，**必须基于日期而非活动偏好**：
- 如果用户提到了具体日期（startDate），**必须基于日期计算季节**：
  - 11月-3月 → winter（冬季）
  - 6月-8月 → summer（夏季）
  - 4月-5月或9月-10月 → spring_autumn（过渡季）
- 如果用户只提到活动（如"看极光"）但没有日期，可以推断为winter
- **重要**：如果日期是9月，即使用户说"看极光"，travelSeason也应该是spring_autumn，而不是winter
- **一致性规则**：travelSeason必须与startDate的月份一致，不能矛盾`,
            validation: {
                required: false,
                enum: ['winter', 'summer', 'spring_autumn'],
            },
        },
        {
            fieldName: 'activityPreferences',
            fieldType: 'array',
            extractionPrompt: '从用户描述中提取活动偏好：aurora_hunting（极光追踪）、glacier_hiking（冰川徒步）、scenic_photography（风景摄影）、hot_springs（温泉）、nature_exploration（自然探索）、adventure_activities（冒险活动）',
            validation: {
                required: false,
                enum: ['aurora_hunting', 'glacier_hiking', 'scenic_photography', 'hot_springs', 'nature_exploration', 'adventure_activities'],
            },
        },
        {
            fieldName: 'riskTolerance',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取风险承受度：low（低，安全舒适为主）、medium（中等，愿意冒一些风险）、high（高，追求刺激）',
            validation: {
                required: false,
                enum: ['low', 'medium', 'high'],
            },
        },
        {
            fieldName: 'travelGroup',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取旅行群体：solo（独旅）、couple（情侣）、friends（朋友小队）、family（家庭含儿童）、group（团队）',
            validation: {
                required: false,
                enum: ['solo', 'couple', 'friends', 'family', 'group'],
            },
        },
    ],
};
//# sourceMappingURL=iceland-clarification.config.js.map