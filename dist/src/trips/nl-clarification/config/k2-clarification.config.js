"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.K2_CONFIG_TEMPLATE = void 0;
const k2_personas_config_1 = require("./k2-personas.config");
exports.K2_CONFIG_TEMPLATE = {
    destinationCode: 'K2',
    destinationName: 'K2（乔戈里峰）',
    enabled: true,
    metadata: {
        description: 'K2（乔戈里峰）目的地澄清配置 - 极高风险登山目的地',
        riskLevel: 'extreme',
        requiresExpertise: true,
        lastUpdated: '2026-01-31',
        credibilityScore: 0.94,
        dataSources: [
            'Himalayan Database（8000米峰登山统计）',
            'K2 Base Camp Rescue/Death Records',
            'American Alpine Journal（登山事故分析）',
            'Adventure Consultants（运营商的K2历史数据）',
            '2008年K2灾难详细调查报告',
            '巴基斯坦Alpine Club历史数据'
        ],
    },
    userPersonas: k2_personas_config_1.K2_USER_PERSONAS,
    clarificationRounds: [
        {
            roundId: 'round_1_basic',
            name: '基础信息',
            description: '收集基础登山信息：目的地、日期、预算',
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
            description: '评估用户的8000米峰经验和K2准备情况',
            triggerConditions: {
                requiredFields: ['destination'],
                previousRoundCompleted: 'round_1_basic',
            },
            questions: [
                {
                    id: 'k2_8000m_experience',
                    question: '您登过多少座8000米峰？',
                    type: 'single_choice',
                    options: [
                        { value: '0', label: '0座' },
                        { value: '1_everest_commercial', label: '1座（珠峰商业线）' },
                        { value: '1_technical', label: '1座（技术峰）' },
                        { value: '2_3_with_technical', label: '2-3座（含技术峰）' },
                        { value: '4_plus_with_technical', label: '4座以上（含2+技术峰）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_8000mExperience',
                    },
                },
                {
                    id: 'k2_technical_climbing',
                    question: '您的技术攀登水平？',
                    type: 'single_choice',
                    options: [
                        { value: 'none', label: '无' },
                        { value: 'alpine_pd_ad', label: '阿尔卑斯PD-AD级' },
                        { value: 'wi3_lead', label: 'WI3/冰壁领攀' },
                        { value: 'wi4_mixed_5_6_7', label: 'WI4/5.6-5.7混合' },
                        { value: 'wi5_plus_5_8', label: 'WI5+/5.8以上' },
                    ],
                    required: true,
                    metadata: {
                        category: 'technical',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_technicalLevel',
                    },
                },
                {
                    id: 'k2_high_altitude_time',
                    question: '您有多少高海拔累计时间？',
                    type: 'single_choice',
                    options: [
                        { value: 'less_than_1_month', label: '少于1个月' },
                        { value: '1_3_months', label: '1-3个月' },
                        { value: '3_6_months', label: '3-6个月' },
                        { value: '6_12_months', label: '6-12个月' },
                        { value: '12_plus_months', label: '12+个月' },
                    ],
                    required: true,
                    metadata: {
                        category: 'experience',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_highAltitudeTime',
                    },
                },
                {
                    id: 'k2_death_risk_tolerance',
                    question: '您能接受的死亡风险？',
                    type: 'single_choice',
                    options: [
                        { value: 'below_5', label: '低于5%' },
                        { value: '5_10', label: '5-10%' },
                        { value: '10_20', label: '10-20%' },
                        { value: '20_25', label: '20-25%' },
                        { value: '25_plus', label: '25%+' },
                    ],
                    required: true,
                    metadata: {
                        category: 'risk',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_deathRiskTolerance',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['k2_8000mExperience', 'k2_technicalLevel', 'k2_highAltitudeTime', 'k2_deathRiskTolerance'],
            },
            priority: 2,
        },
        {
            roundId: 'round_3_k2_knowledge',
            name: 'K2知识评估',
            description: '评估用户对K2的了解程度和风险认知',
            triggerConditions: {
                requiredFields: ['k2_8000mExperience', 'k2_technicalLevel'],
                previousRoundCompleted: 'round_2_experience_assessment',
            },
            questions: [
                {
                    id: 'k2_knowledge_level',
                    question: '您对K2有多少了解？',
                    type: 'single_choice',
                    options: [
                        { value: 'movie_documentary', label: '看过电影/纪录片' },
                        { value: 'few_articles', label: '读过几篇文章' },
                        { value: 'studied_death_stats', label: '研究过死亡统计' },
                        { value: 'familiar_major_events', label: '熟悉所有重大事件' },
                        { value: 'can_analyze_risks', label: '能分析技术难点和风险' },
                    ],
                    required: true,
                    metadata: {
                        category: 'knowledge',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_knowledgeLevel',
                    },
                },
                {
                    id: 'k2_teammate_rescue',
                    question: '如果队友无法继续，您会？',
                    type: 'single_choice',
                    options: [
                        { value: 'help_safe_return', label: '帮他/她回到安全地方' },
                        { value: 'attempt_rescue', label: '尝试救援' },
                        { value: 'continue_summit', label: '继续向峰顶' },
                        { value: 'uncertain', label: '不确定' },
                    ],
                    required: true,
                    metadata: {
                        category: 'ethics',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_teammateRescue',
                    },
                },
                {
                    id: 'k2_abandon_decision',
                    question: '您是否能够在死亡地带做出放弃决定？',
                    type: 'single_choice',
                    options: [
                        { value: 'uncertain', label: '不确定' },
                        { value: 'maybe_too_late', label: '可能太晚' },
                        { value: 'yes_clear_thresholds', label: '可以（时间/海拔阈值清晰）' },
                    ],
                    required: true,
                    metadata: {
                        category: 'decision',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_abandonDecision',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['k2_knowledgeLevel', 'k2_teammateRescue', 'k2_abandonDecision'],
            },
            priority: 3,
        },
        {
            roundId: 'round_4_gate',
            name: 'Should-Exist Gate',
            description: '最终风险评估和强烈劝阻（如适用）',
            triggerConditions: {
                requiredFields: ['k2_8000mExperience', 'k2_technicalLevel', 'k2_deathRiskTolerance'],
                previousRoundCompleted: 'round_3_k2_knowledge',
            },
            questions: [
                {
                    id: 'k2_understands_death_probability',
                    question: '您是否理解K2的死亡概率约为23%，这意味着您有接近1/4的概率永远回不了家？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_understandsDeathProbability',
                    },
                },
                {
                    id: 'k2_accepts_2008_disaster',
                    question: '您是否了解2008年K2灾难，11人在瓶颈区域因冰塔坍塌死亡？',
                    type: 'boolean',
                    required: true,
                    metadata: {
                        category: 'risk_understanding',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_accepts2008Disaster',
                    },
                },
                {
                    id: 'k2_final_reflection',
                    question: '如果您知道登K2有25%的概率永远回不了家，您还会去吗？',
                    type: 'single_choice',
                    options: [
                        { value: 'yes', label: '会（我完全理解并接受风险）' },
                        { value: 'no', label: '不会（K2不适合我）' },
                        { value: 'need_more_time', label: '需要更多时间考虑' },
                    ],
                    required: true,
                    metadata: {
                        category: 'final_decision',
                        priority: 'high',
                        isCritical: true,
                        fieldName: 'k2_finalReflection',
                    },
                },
            ],
            completionConditions: {
                requiredFields: ['k2_understandsDeathProbability', 'k2_accepts2008Disaster', 'k2_finalReflection'],
                allQuestionsAnswered: true,
            },
            priority: 4,
        },
    ],
    gatePrechecks: [
        {
            checkId: 'k2_experience_gate',
            name: '经验与K2匹配检查',
            triggerConditions: {
                requiredFields: ['k2_8000mExperience', 'k2_technicalLevel', 'k2_deathRiskTolerance'],
                fieldConditions: [
                    {
                        fieldId: 'k2_8000mExperience',
                        operator: 'in',
                        value: ['0', '1_everest_commercial'],
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的8000米峰经验是否适合K2。
如果 k2_8000mExperience='0' 或 '1_everest_commercial'，则强烈劝阻。
如果 k2_technicalLevel='none' 或 'alpine_pd_ad'，则强烈劝阻。
如果 k2_deathRiskTolerance='below_5' 或 '5_10'，则强烈劝阻。
K2不是目的地，是致命挑战，死亡率23%。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ 根据您的经验水平，K2对您来说极其危险。K2的死亡概率约为23%，这不是一个普通的登山目的地。强烈建议您选择其他8000米峰或先积累更多经验。',
                alternatives: [
                    {
                        label: '选择其他8000米峰',
                        description: '推荐：珠峰（商业路线）、卓奥友、希夏邦马',
                        action: 'suggest_alternative_mountains',
                    },
                    {
                        label: '制定5年培养计划',
                        description: '如果仍想尝试K2，需要至少5年的准备',
                        action: 'show_5_year_plan',
                    },
                    {
                        label: '放弃K2，选择技术峰',
                        description: '推荐：蒙特罗莎、马特洪峰等阿尔卑斯技术峰',
                        action: 'suggest_technical_peaks',
                    },
                ],
                additionalQuestions: [],
            },
        },
        {
            checkId: 'k2_risk_tolerance_gate',
            name: '风险承受度检查',
            triggerConditions: {
                requiredFields: ['k2_deathRiskTolerance'],
                fieldConditions: [
                    {
                        fieldId: 'k2_deathRiskTolerance',
                        operator: 'in',
                        value: ['below_5', '5_10'],
                    },
                ],
            },
            checkType: 'hard_gate',
            checkLogic: {
                useLLM: true,
                llmPrompt: `检查用户的风险承受度是否适合K2。
如果 k2_deathRiskTolerance='below_5' 或 '5_10'，则强烈劝阻。
K2的死亡概率是23%，如果用户无法接受这个风险，不应该尝试。`,
            },
            failureResponse: {
                blockType: 'block',
                warningMessage: '⚠️ K2的死亡概率约为23%，这远高于您能接受的风险水平。强烈建议您选择其他山峰。',
                alternatives: [
                    {
                        label: '选择更安全的8000米峰',
                        description: '推荐：珠峰（商业路线）、卓奥友',
                        action: 'suggest_safer_8000m',
                    },
                ],
                additionalQuestions: [],
            },
        },
    ],
    fieldExtractionRules: [
        {
            fieldName: 'k2_8000mExperience',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取8000米峰经验：0（无）、1_everest_commercial（1座珠峰商业线）、1_technical（1座技术峰）、2_3_with_technical（2-3座含技术峰）、4_plus_with_technical（4座以上含2+技术峰）',
            validation: {
                required: false,
                enum: ['0', '1_everest_commercial', '1_technical', '2_3_with_technical', '4_plus_with_technical'],
            },
        },
        {
            fieldName: 'k2_technicalLevel',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取技术攀登水平：none（无）、alpine_pd_ad（阿尔卑斯PD-AD级）、wi3_lead（WI3/冰壁领攀）、wi4_mixed_5_6_7（WI4/5.6-5.7混合）、wi5_plus_5_8（WI5+/5.8以上）',
            validation: {
                required: false,
                enum: ['none', 'alpine_pd_ad', 'wi3_lead', 'wi4_mixed_5_6_7', 'wi5_plus_5_8'],
            },
        },
        {
            fieldName: 'k2_deathRiskTolerance',
            fieldType: 'string',
            extractionPrompt: '从用户描述中提取死亡风险承受度：below_5（低于5%）、5_10（5-10%）、10_20（10-20%）、20_25（20-25%）、25_plus（25%+）',
            validation: {
                required: false,
                enum: ['below_5', '5_10', '10_20', '20_25', '25_plus'],
            },
        },
    ],
};
//# sourceMappingURL=k2-clarification.config.js.map