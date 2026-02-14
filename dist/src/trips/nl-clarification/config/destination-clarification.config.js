"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOFOTEN_CONFIG_TEMPLATE = exports.TIBET_CONFIG_TEMPLATE = exports.K2_CONFIG_TEMPLATE = exports.SVALBARD_CONFIG_TEMPLATE = exports.SVALBARD_USER_PERSONAS = exports.ALPS_CONFIG_TEMPLATE = exports.ALPS_USER_PERSONAS = exports.K2_USER_PERSONAS = exports.GREENLAND_USER_PERSONAS = exports.ICELAND_CONFIG_TEMPLATE = exports.GREENLAND_CONFIG_TEMPLATE = void 0;
const greenland_personas_config_1 = require("./greenland-personas.config");
exports.GREENLAND_CONFIG_TEMPLATE = {
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
    userPersonas: greenland_personas_config_1.GREENLAND_USER_PERSONAS,
    clarificationRounds: [
        {
            roundId: 'round_1_basic',
            name: '基础信息',
            description: '收集基础旅行信息',
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
var iceland_clarification_config_1 = require("./iceland-clarification.config");
Object.defineProperty(exports, "ICELAND_CONFIG_TEMPLATE", { enumerable: true, get: function () { return iceland_clarification_config_1.ICELAND_CONFIG_TEMPLATE; } });
var greenland_personas_config_2 = require("./greenland-personas.config");
Object.defineProperty(exports, "GREENLAND_USER_PERSONAS", { enumerable: true, get: function () { return greenland_personas_config_2.GREENLAND_USER_PERSONAS; } });
var k2_personas_config_1 = require("./k2-personas.config");
Object.defineProperty(exports, "K2_USER_PERSONAS", { enumerable: true, get: function () { return k2_personas_config_1.K2_USER_PERSONAS; } });
var alps_personas_config_1 = require("./alps-personas.config");
Object.defineProperty(exports, "ALPS_USER_PERSONAS", { enumerable: true, get: function () { return alps_personas_config_1.ALPS_USER_PERSONAS; } });
var alps_clarification_config_1 = require("./alps-clarification.config");
Object.defineProperty(exports, "ALPS_CONFIG_TEMPLATE", { enumerable: true, get: function () { return alps_clarification_config_1.ALPS_CONFIG_TEMPLATE; } });
var svalbard_personas_config_1 = require("./svalbard-personas.config");
Object.defineProperty(exports, "SVALBARD_USER_PERSONAS", { enumerable: true, get: function () { return svalbard_personas_config_1.SVALBARD_USER_PERSONAS; } });
var svalbard_clarification_config_1 = require("./svalbard-clarification.config");
Object.defineProperty(exports, "SVALBARD_CONFIG_TEMPLATE", { enumerable: true, get: function () { return svalbard_clarification_config_1.SVALBARD_CONFIG_TEMPLATE; } });
var k2_clarification_config_1 = require("./k2-clarification.config");
Object.defineProperty(exports, "K2_CONFIG_TEMPLATE", { enumerable: true, get: function () { return k2_clarification_config_1.K2_CONFIG_TEMPLATE; } });
var tibet_clarification_config_1 = require("./tibet-clarification.config");
Object.defineProperty(exports, "TIBET_CONFIG_TEMPLATE", { enumerable: true, get: function () { return tibet_clarification_config_1.TIBET_CONFIG_TEMPLATE; } });
var lofoten_clarification_config_1 = require("./lofoten-clarification.config");
Object.defineProperty(exports, "LOFOTEN_CONFIG_TEMPLATE", { enumerable: true, get: function () { return lofoten_clarification_config_1.LOFOTEN_CONFIG_TEMPLATE; } });
//# sourceMappingURL=destination-clarification.config.js.map