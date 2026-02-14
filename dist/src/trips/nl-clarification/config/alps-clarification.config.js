"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALPS_CONFIG_TEMPLATE = void 0;
const alps_personas_config_1 = require("./alps-personas.config");
exports.ALPS_CONFIG_TEMPLATE = {
    destinationCode: 'AL',
    destinationName: '阿尔卑斯',
    enabled: true,
    metadata: {
        description: '阿尔卑斯山特化澄清配置 - 基于分层用户画像系统',
        riskLevel: 'high',
        requiresExpertise: true,
        lastUpdated: '2026-01-31',
        credibilityScore: 0.94,
        dataSources: [
            'SBB铁路和缆车运营商官方数据',
            'SAC（瑞士登山俱乐部）、CAF（法国登山俱乐部）会员数据',
            'IFMGA向导和登山学校培训经验',
            '直升机救援和保险公司事故数据',
            '登山社区和论坛反馈'
        ],
    },
    userPersonas: alps_personas_config_1.ALPS_USER_PERSONAS,
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
            name: '登山经验和能力',
            description: '了解用户的登山经验、体力水平和风险承受度',
            triggerConditions: {
                requiredFields: ['destination'],
                previousRoundCompleted: 'round_1_basic',
            },
            questions: [
                {
                    id: 'alps_experience_level',
                    question: '您的登山经验如何？',
                    type: 'single_choice',
                    options: [
                        { value: 'first_timer', label: '从未登山或只在平地步行' },
                        { value: 'beginner', label: '有1-3次登山经验（最高2000m）' },
                        { value: 'intermediate', label: '有多次登山经验（达到3000m+）' },
                        { value: 'advanced', label: '多次4000m+登顶或技术攀登' },
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
                    id: 'alps_highest_altitude',
                    question: '您的最高登山经历是？',
                    type: 'single_choice',
                    options: [
                        { value: 'below_1500m', label: '低于1500m' },
                        { value: '1500_3000m', label: '1500-3000m' },
                        { value: '3000_4000m', label: '3000-4000m' },
                        { value: 'above_4000m', label: '4000m以上' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'highestAltitude',
                    },
                },
                {
                    id: 'alps_physical_fitness',
                    question: '您的体力水平？',
                    type: 'single_choice',
                    options: [
                        { value: 'casual', label: '日常散步，不定期运动' },
                        { value: 'regular', label: '定期运动（每周3次），可连续活动4-6小时' },
                        { value: 'intense', label: '高强度训练，可承受8小时+登山' },
                    ],
                    required: true,
                    metadata: {
                        category: 'fitness',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'physicalFitness',
                    },
                },
                {
                    id: 'alps_risk_tolerance',
                    question: '您能接受的风险和不适？',
                    type: 'single_choice',
                    options: [
                        { value: 'low', label: '不想承受严重风险，需要安全保障和舒适' },
                        { value: 'medium', label: '可以接受中等风险和不适（恶劣天气、肌肉酸痛），有向导或朋友同行' },
                        { value: 'high', label: '能接受高风险和极端不适（寒冷、暴露、技术难度），有能力应急' },
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
                    id: 'alps_special_skills',
                    question: '您有哪些特殊技能？（可多选）',
                    type: 'multi_choice',
                    options: [
                        { value: 'none', label: '没有特殊登山技能' },
                        { value: 'navigation', label: '基础导航和地图阅读' },
                        { value: 'backpacking', label: '多日背包露营' },
                        { value: 'rock_climbing', label: '岩石攀登（UIAA III+）' },
                        { value: 'glacier_rescue', label: '冰川救援认证' },
                        { value: 'ice_climbing', label: '冰爪使用和绳组管理' },
                        { value: 'avalanche', label: '雪崩认证（IFAK L2）' },
                        { value: 'winter_mountaineering', label: '冬季登山经验' },
                    ],
                    required: false,
                    metadata: {
                        category: 'skills',
                        priority: 'medium',
                        fieldName: 'specialSkills',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['experienceLevel', 'highestAltitude', 'physicalFitness', 'riskTolerance'],
            },
            priority: 2,
        },
        {
            roundId: 'round_3_activities',
            name: '活动偏好',
            description: '了解用户想进行的活动类型和路线偏好',
            triggerConditions: {
                requiredFields: ['experienceLevel', 'riskTolerance'],
                previousRoundCompleted: 'round_2_experience',
            },
            questions: [
                {
                    id: 'alps_travel_season',
                    question: '您计划什么时候来阿尔卑斯？',
                    type: 'single_choice',
                    options: [
                        { value: 'summer', label: '夏季（6月-9月，最佳徒步季）' },
                        { value: 'winter', label: '冬季（12月-5月，滑雪登山）' },
                        { value: 'spring_autumn', label: '春秋（4月-5月或10月-11月，过渡季）' },
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
                    id: 'alps_activity_types',
                    question: '您最想进行的活动类型是？（可多选）',
                    type: 'multi_choice',
                    options: [
                        { value: 'cable_car_sightseeing', label: '缆车观光+轻松步行' },
                        { value: 'day_hiking', label: '一日徒步（5-Seenweg等）' },
                        { value: 'multi_day_trekking', label: '多日徒步（TMB、Alta Via等）' },
                        { value: 'via_ferrata', label: 'Via Ferrata（铁索攀岩）' },
                        { value: 'glacier_trekking', label: '冰川徒步' },
                        { value: 'peak_climbing', label: '4000m高峰登顶（勃朗峰、马特洪峰等）' },
                        { value: 'technical_climbing', label: '技术攀登（北面路线）' },
                        { value: 'ski_mountaineering', label: '滑雪登山（Haute Route on skis）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'activity',
                        priority: 'high',
                        fieldName: 'activityTypes',
                    },
                },
                {
                    id: 'alps_route_preference',
                    question: '您更偏好哪种路线？',
                    type: 'single_choice',
                    options: [
                        { value: 'popular_classic', label: '经典热门路线（TMB、少女峰等）' },
                        { value: 'off_beaten', label: '小众路线（避开人群）' },
                        { value: 'challenging', label: '高难度挑战路线' },
                        { value: 'flexible', label: '灵活，根据能力选择' },
                    ],
                    required: false,
                    metadata: {
                        category: 'preference',
                        priority: 'medium',
                        fieldName: 'routePreference',
                    },
                },
                {
                    id: 'alps_accommodation_preference',
                    question: '您的住宿偏好是？',
                    type: 'single_choice',
                    options: [
                        { value: 'hotel', label: '酒店（舒适）' },
                        { value: 'mountain_hut', label: '山屋（共享设施）' },
                        { value: 'camping', label: '露营（自给自足）' },
                        { value: 'flexible', label: '灵活' },
                    ],
                    required: false,
                    metadata: {
                        category: 'accommodation',
                        priority: 'medium',
                        fieldName: 'accommodationPreference',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['travelSeason', 'activityTypes'],
            },
            priority: 3,
        },
        {
            roundId: 'round_4_preparation',
            name: '准备和装备',
            description: '确认装备准备、保险和安全措施',
            triggerConditions: {
                requiredFields: ['activityTypes'],
                previousRoundCompleted: 'round_3_activities',
            },
            questions: [
                {
                    id: 'alps_has_equipment',
                    question: '您是否自备登山装备？',
                    type: 'boolean',
                    required: false,
                    metadata: {
                        category: 'equipment',
                        priority: 'medium',
                        fieldName: 'hasEquipment',
                    },
                },
                {
                    id: 'alps_equipment_needs',
                    question: '您需要租赁或购买的装备类型？（可多选）',
                    type: 'multi_choice',
                    options: [
                        { value: 'boots', label: '登山靴' },
                        { value: 'clothing', label: '分层衣物系统' },
                        { value: 'backpack', label: '背包（40-60L）' },
                        { value: 'technical', label: '技术装备（冰斧、冰爪、绳索等）' },
                        { value: 'safety', label: '安全装备（头盔、雪崩装备等）' },
                        { value: 'none', label: '不需要' },
                    ],
                    required: false,
                    dependencies: [
                        {
                            fieldId: 'alps_has_equipment',
                            value: false,
                        },
                    ],
                    metadata: {
                        category: 'equipment',
                        priority: 'medium',
                        fieldName: 'equipmentNeeds',
                    },
                },
                {
                    id: 'alps_has_guide',
                    question: '您是否需要专业向导？',
                    type: 'single_choice',
                    options: [
                        { value: 'required', label: '必需（技术路线、4000m+登顶）' },
                        { value: 'preferred', label: '推荐（首次高海拔、冰川路线）' },
                        { value: 'not_needed', label: '不需要（有经验，自主能力）' },
                        { value: 'unsure', label: '不确定，需要建议' },
                    ],
                    required: false,
                    metadata: {
                        category: 'guide',
                        priority: 'high',
                        fieldName: 'hasGuide',
                    },
                },
                {
                    id: 'alps_has_insurance',
                    question: '您是否有山地旅游保险（包括直升机救援）？',
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
                    id: 'alps_altitude_acclimatization',
                    question: '您是否有高海拔适应经验？',
                    type: 'single_choice',
                    options: [
                        { value: 'none', label: '无经验（最高2500m）' },
                        { value: 'some', label: '有经验（3000-3500m）' },
                        { value: 'experienced', label: '经验丰富（4000m+）' },
                    ],
                    required: false,
                    metadata: {
                        category: 'acclimatization',
                        priority: 'medium',
                        fieldName: 'altitudeAcclimatization',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['hasInsurance'],
            },
            priority: 4,
        },
        {
            roundId: 'round_5_gate',
            name: 'Should-Exist Gate',
            description: '最终安全确认和知情同意',
            triggerConditions: {
                requiredFields: ['experienceLevel', 'riskTolerance', 'activityTypes', 'hasInsurance'],
                previousRoundCompleted: 'round_4_preparation',
            },
            questions: [
                {
                    id: 'alps_understands_risks',
                    question: '您是否理解以下真实风险：\n1. 天气变化速度极快（20分钟内可能改变）\n2. 高海拔反应（头痛、决策能力下降，最坏情况脑水肿）\n3. 失温危险（高山最常见的致死原因）\n4. 滑坠和坠落风险（技术路线）\n5. 雪崩风险（冬季）\n6. 冰川裂缝和冰崩（冰川路线）\n7. 救援延迟（某些地区需要数小时）',
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
                    id: 'alps_understands_altitude',
                    question: '您是否理解高海拔的影响：\n1. 3000m+可能出现头痛和疲劳\n2. 4000m+高原反应风险显著增加\n3. 需要缓慢上升和充分休息\n4. 知道何时撤退是最重要的技能',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'altitude_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsAltitude',
                    },
                },
                {
                    id: 'alps_understands_weather',
                    question: '您是否理解阿尔卑斯天气的多变性：\n1. 天气可在20分钟内从晴朗变为暴风雪\n2. 需要每小时检查天气\n3. 必须携带防雨和保暖装备\n4. 知道撤退路线和避难所位置',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'weather_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'understandsWeather',
                    },
                },
                {
                    id: 'alps_gives_consent',
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
                requiredFields: ['understandsRisks', 'understandsAltitude', 'understandsWeather', 'givesConsent'],
                allQuestionsAnswered: true,
            },
            priority: 5,
        },
    ],
    gatePrechecks: [
        {
            checkId: 'alps_experience_activity_match',
            name: '经验与活动匹配检查',
            triggerConditions: {
                requiredFields: ['experienceLevel', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'activityTypes',
                        operator: 'in',
                        value: ['peak_climbing', 'technical_climbing', 'ski_mountaineering'],
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的登山经验是否与选择的活动类型匹配。
如果 activityTypes 包含 'peak_climbing'（4000m高峰登顶）但 experienceLevel='first_timer' 或 'beginner'，则阻止。
如果 activityTypes 包含 'technical_climbing'（技术攀登）但 experienceLevel='first_timer' 或 'beginner'，则阻止。
如果 activityTypes 包含 'ski_mountaineering'（滑雪登山）但 experienceLevel='first_timer'，则阻止。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您选择的是高难度活动，但您的经验水平可能不足。为了您的安全，我们强烈建议您先选择适合您经验水平的活动。',
                alternatives: [
                    {
                        label: '选择适合初学者的活动',
                        description: '推荐：缆车观光+轻松步行、一日徒步（5-Seenweg）',
                        action: 'set_activity_types:cable_car_sightseeing,day_hiking',
                    },
                    {
                        label: '选择需要向导的活动',
                        description: '推荐：向导下的4000m登顶、技术攀登',
                        action: 'set_has_guide:required',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'alps_altitude_fitness_match',
            name: '海拔与体力匹配检查',
            triggerConditions: {
                requiredFields: ['highestAltitude', 'physicalFitness', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'activityTypes',
                        operator: 'in',
                        value: ['peak_climbing', 'glacier_trekking'],
                    },
                ],
            },
            checkType: 'soft_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的海拔经历和体力是否与选择的活动匹配。
如果 activityTypes 包含 'peak_climbing' 但 highestAltitude='below_1500m' 且 physicalFitness='casual'，则警告。
如果 activityTypes 包含 'glacier_trekking' 但 highestAltitude='below_1500m'，则警告。`,
            },
            failureResponse: {
                blockType: 'warning',
                warningMessage: '⚠️ 您选择的活动需要较高的海拔经验和体力。建议您先进行一些较低海拔的适应训练，或选择需要专业向导的活动。',
                alternatives: [
                    {
                        label: '选择较低海拔活动',
                        description: '推荐：3000m以下的徒步路线',
                        action: 'set_activity_types:day_hiking,multi_day_trekking',
                    },
                    {
                        label: '选择需要向导的活动',
                        description: '向导可以帮助您安全地完成高海拔活动',
                        action: 'set_has_guide:required',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'alps_risk_activity_match',
            name: '风险承受度与活动匹配检查',
            triggerConditions: {
                requiredFields: ['riskTolerance', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'riskTolerance',
                        operator: 'equals',
                        value: 'low',
                    },
                    {
                        fieldId: 'activityTypes',
                        operator: 'in',
                        value: ['technical_climbing', 'peak_climbing', 'ski_mountaineering'],
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: false,
                useRuleEngine: true,
                ruleExpression: 'riskTolerance == "low" && (activityTypes.contains("technical_climbing") || activityTypes.contains("peak_climbing") || activityTypes.contains("ski_mountaineering"))',
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 您选择的活动风险较高，但您的风险承受度较低。为了您的安全，我们建议您选择风险较低的活动。',
                alternatives: [
                    {
                        label: '选择低风险活动',
                        description: '推荐：缆车观光、一日徒步、多日徒步（TMB等经典路线）',
                        action: 'set_activity_types:cable_car_sightseeing,day_hiking,multi_day_trekking',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'alps_winter_safety',
            name: '冬季活动安全检查',
            triggerConditions: {
                requiredFields: ['travelSeason', 'activityTypes'],
                fieldConditions: [
                    {
                        fieldId: 'travelSeason',
                        operator: 'equals',
                        value: 'winter',
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查冬季活动的安全要求。
如果 travelSeason='winter' 且 activityTypes 包含 'ski_mountaineering' 但 specialSkills 不包含 'avalanche'，则阻止。
如果 travelSeason='winter' 且 activityTypes 包含 'ski_mountaineering' 但 experienceLevel='first_timer'，则阻止。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 冬季滑雪登山需要雪崩认证和高级滑雪技能。为了您的安全，我们强烈建议您先获得必要的认证和经验。',
                alternatives: [
                    {
                        label: '选择夏季活动',
                        description: '夏季是阿尔卑斯徒步的最佳季节',
                        action: 'set_travel_season:summer',
                    },
                    {
                        label: '选择需要向导的冬季活动',
                        description: '专业向导可以提供安全保障',
                        action: 'set_has_guide:required',
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
            extractionPrompt: '从用户描述中提取登山经验水平：first_timer（从未登山）、beginner（有1-3次经验，最高2000m）、intermediate（多次经验，达到3000m+）、advanced（多次4000m+登顶或技术攀登）',
            validation: {
                required: false,
                enum: ['first_timer', 'beginner', 'intermediate', 'advanced'],
            },
        },
        {
            fieldName: 'highestAltitude',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取最高登山经历：below_1500m（低于1500m）、1500_3000m（1500-3000m）、3000_4000m（3000-4000m）、above_4000m（4000m以上）',
            validation: {
                required: false,
                enum: ['below_1500m', '1500_3000m', '3000_4000m', 'above_4000m'],
            },
        },
        {
            fieldName: 'physicalFitness',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取体力水平：casual（日常散步）、regular（定期运动，可连续4-6小时）、intense（高强度训练，可承受8小时+）',
            validation: {
                required: false,
                enum: ['casual', 'regular', 'intense'],
            },
        },
        {
            fieldName: 'riskTolerance',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取风险承受度：low（低风险，需要安全保障）、medium（中等风险，有向导或朋友同行）、high（高风险，有能力应急）',
            validation: {
                required: false,
                enum: ['low', 'medium', 'high'],
            },
        },
        {
            fieldName: 'travelSeason',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取旅行季节：summer（夏季6-9月）、winter（冬季12-5月）、spring_autumn（春秋4-5月或10-11月）',
            validation: {
                required: false,
                enum: ['summer', 'winter', 'spring_autumn'],
            },
        },
        {
            fieldName: 'activityTypes',
            fieldType: 'array',
            extractionPrompt: '从用户描述中提取活动类型：cable_car_sightseeing（缆车观光）、day_hiking（一日徒步）、multi_day_trekking（多日徒步）、via_ferrata（铁索攀岩）、glacier_trekking（冰川徒步）、peak_climbing（4000m高峰登顶）、technical_climbing（技术攀登）、ski_mountaineering（滑雪登山）',
            validation: {
                required: false,
            },
        },
    ],
};
//# sourceMappingURL=alps-clarification.config.js.map