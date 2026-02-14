"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOFOTEN_CONFIG_TEMPLATE = void 0;
const lofoten_personas_config_1 = require("./lofoten-personas.config");
exports.LOFOTEN_CONFIG_TEMPLATE = {
    destinationCode: 'LF',
    destinationName: '罗弗敦',
    enabled: true,
    metadata: {
        description: '罗弗敦目的地澄清配置 - 北极山地探险目的地',
        riskLevel: 'medium',
        requiresExpertise: false,
        lastUpdated: '2026-01-26',
        credibilityScore: 0.91,
        dataSources: [
            '罗弗敦旅游统计数据',
            '本地登山向导访谈',
            '探险公司客户档案',
            '搜救事故分析',
            '极地探险协会研究'
        ],
    },
    userPersonas: lofoten_personas_config_1.LOFOTEN_USER_PERSONAS,
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
            roundId: 'round_2_experience_assessment',
            name: '经验评估',
            description: '评估用户的北极/山地经验和准备情况',
            triggerConditions: {
                requiredFields: ['destination'],
            },
            questions: [
                {
                    id: 'lft_arctic_experience',
                    question: '您是否有北极或高海拔地区经验？',
                    type: 'single_choice',
                    options: [
                        { value: 'none', label: '没有，这是第一次' },
                        { value: '1_2_times', label: '有1-2次经验' },
                        { value: '3_5_times', label: '有3-5次经验' },
                        { value: '5_plus', label: '有5次以上经验' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'arcticExperience',
                    },
                },
                {
                    id: 'lft_mountain_experience',
                    question: '您的登山/徒步经验如何？',
                    type: 'single_choice',
                    options: [
                        { value: 'none', label: '无经验' },
                        { value: 'beginner', label: '初级（1-3次，简单路线）' },
                        { value: 'intermediate', label: '中级（多次，中等难度）' },
                        { value: 'advanced', label: '高级（技术路线，多日远征）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'mountainExperience',
                    },
                },
                {
                    id: 'lft_physical_fitness',
                    question: '您的体能水平如何？',
                    type: 'single_choice',
                    options: [
                        { value: 'low', label: '低（日常散步）' },
                        { value: 'medium', label: '中等（定期运动）' },
                        { value: 'high', label: '高（高强度训练）' },
                        { value: 'excellent', label: '卓越（专业运动员级别）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'health',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'physicalFitness',
                    },
                },
                {
                    id: 'lft_risk_tolerance',
                    question: '您能接受的风险水平？',
                    type: 'single_choice',
                    options: [
                        { value: 'low', label: '低（完全安全，有向导）' },
                        { value: 'medium', label: '中等（有专业支持）' },
                        { value: 'high', label: '高（可接受一定危险）' },
                        { value: 'extreme', label: '极高（可接受致命风险）' },
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
                    id: 'lft_travel_season',
                    question: '您计划什么季节前往？',
                    type: 'single_choice',
                    options: [
                        { value: 'winter', label: '冬季（11月-3月，极光）' },
                        { value: 'spring', label: '春季（4-5月，过渡季）' },
                        { value: 'summer', label: '夏季（6-8月，午夜太阳）' },
                        { value: 'autumn', label: '秋季（9-10月，过渡季）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'planning',
                        priority: 'medium',
                        isCritical: false,
                        fieldName: 'travelSeason',
                    },
                },
                {
                    id: 'lft_activity_types',
                    question: '您感兴趣的活动类型？',
                    type: 'multi_choice',
                    options: [
                        { value: 'scenic_driving', label: '景观自驾（E10公路）' },
                        { value: 'guided_hiking', label: '指导登山（Reinebringen等）' },
                        { value: 'village_exploration', label: '渔村探索' },
                        { value: 'photography', label: '摄影（极光/午夜太阳）' },
                        { value: 'multi_day_trekking', label: '多日徒步远征' },
                        { value: 'winter_mountaineering', label: '冬季登山' },
                        { value: 'kayaking', label: '皮划艇' },
                    ],
                    required: true,
                    metadata: {
                        category: 'preferences',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'activityTypes',
                    },
                },
                {
                    id: 'lft_has_guide',
                    question: '您是否计划使用向导？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'planning',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'hasGuide',
                    },
                },
                {
                    id: 'lft_has_insurance',
                    question: '您是否购买了包含北极救援的保险？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'insurance',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'hasArcticInsurance',
                    },
                },
            ],
            completionConditions: {
                requiredFields: [
                    'arcticExperience',
                    'mountainExperience',
                    'physicalFitness',
                    'riskTolerance',
                    'travelSeason',
                    'activityTypes',
                    'hasGuide',
                    'hasArcticInsurance',
                ],
            },
            priority: 2,
        },
    ],
    gatePrechecks: [
        {
            checkId: 'lft_experience_match_gate',
            name: '经验与活动匹配检查',
            triggerConditions: {
                requiredFields: [
                    'arcticExperience',
                    'mountainExperience',
                    'physicalFitness',
                    'riskTolerance',
                    'activityTypes',
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的经验水平是否与选择的活动匹配。
如果 activityTypes 包含 'multi_day_trekking'（多日徒步远征）但 mountainExperience='none' 或 'beginner'，则阻止。
如果 activityTypes 包含 'winter_mountaineering'（冬季登山）但 arcticExperience='none'，则阻止。
如果 activityTypes 包含 'winter_mountaineering' 但 hasGuide=false，则强烈警告。
如果 riskTolerance='low' 但 activityTypes 包含高风险活动，则建议更安全的替代方案。
罗弗敦环境可能危险（湿滑花岗岩、黑冰、快速天气变化），经验不足可能导致严重伤害。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 根据您的经验水平和选择的活动，罗弗敦对您来说可能存在较高风险。罗弗敦的山地环境可能危险（湿滑花岗岩、黑冰、快速天气变化），经验不足可能导致严重伤害。强烈建议：1) 选择更安全的路线；2) 使用专业向导；3) 或先积累更多经验。',
                alternatives: [
                    {
                        label: '选择更安全的路线',
                        description: '推荐：E10自驾、指导登山、渔村探索',
                        action: 'suggest_safer_routes',
                    },
                    {
                        label: '使用专业向导',
                        description: '向导可以提供安全保障和技能指导',
                        action: 'require_guide',
                    },
                    {
                        label: '先积累经验',
                        description: '建议先在更温和的环境中积累经验',
                        action: 'suggest_experience_building',
                    },
                ],
            },
        },
    ],
    fieldExtractionRules: [
        {
            fieldName: 'arcticExperience',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取北极/高海拔经验：none（无经验）、1_2_times（1-2次）、3_5_times（3-5次）、5_plus（5次以上）',
            validation: {
                required: false,
                enum: ['none', '1_2_times', '3_5_times', '5_plus'],
            },
        },
        {
            fieldName: 'mountainExperience',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取登山/徒步经验：none（无经验）、beginner（初级）、intermediate（中级）、advanced（高级）',
            validation: {
                required: false,
                enum: ['none', 'beginner', 'intermediate', 'advanced'],
            },
        },
        {
            fieldName: 'physicalFitness',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取体能水平：low（低）、medium（中等）、high（高）、excellent（卓越）',
            validation: {
                required: false,
                enum: ['low', 'medium', 'high', 'excellent'],
            },
        },
        {
            fieldName: 'riskTolerance',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取风险容忍度：low（低风险）、medium（中等风险）、high（高风险）、extreme（极高风险）',
            validation: {
                required: false,
                enum: ['low', 'medium', 'high', 'extreme'],
            },
        },
        {
            fieldName: 'travelSeason',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取旅行季节：winter（冬季11-3月）、spring（春季4-5月）、summer（夏季6-8月）、autumn（秋季9-10月）',
            validation: {
                required: false,
                enum: ['winter', 'spring', 'summer', 'autumn'],
            },
        },
        {
            fieldName: 'activityTypes',
            fieldType: 'array',
            extractionPrompt: '从用户描述中提取活动类型：scenic_driving（景观自驾）、guided_hiking（指导登山）、village_exploration（渔村探索）、photography（摄影）、multi_day_trekking（多日徒步）、winter_mountaineering（冬季登山）、kayaking（皮划艇）',
            validation: {
                required: false,
            },
        },
        {
            fieldName: 'hasGuide',
            fieldType: 'boolean',
            extractionPrompt: '用户是否计划使用向导',
            validation: {
                required: false,
            },
        },
        {
            fieldName: 'hasArcticInsurance',
            fieldType: 'boolean',
            extractionPrompt: '用户是否购买了包含北极救援的保险',
            validation: {
                required: false,
            },
        },
    ],
};
//# sourceMappingURL=lofoten-clarification.config.js.map