"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SVALBARD_USER_PERSONAS = void 0;
exports.SVALBARD_USER_PERSONAS = {
    metadata: {
        version: "1.0.0",
        last_updated: "2026-01-31",
        description: "斯瓦尔巴极地访问者用户画像系统",
        credibility_score: 0.91,
        language: "zh-CN",
        critical_note: "斯瓦尔巴与冰岛完全不同 - 这里是极地，不仅是冒险"
    },
    overview: {
        purpose: "帮助用户快速识别自己是否适合斯瓦尔巴 - 这里是极地生存体验，不是普通旅游",
        philosophy: "安全优先 - 早期发现'不适合者'比优化体验更重要，因为风险是致命的",
        key_difference_from_iceland: [
            "冰岛是'可去可不去'的旅游目的地",
            "斯瓦尔巴是'生存体验'，不是单纯旅游",
            "冰岛的风险可控，斯瓦尔巴的风险致命",
            "冰岛可以自驾，斯瓦尔巴必须有向导",
            "冰岛失败可重来，斯瓦尔巴失败可能死亡"
        ]
    },
    user_personas: [
        {
            persona_id: "sj_persona_001",
            persona_name: "极地朝圣者",
            persona_name_en: "Arctic Pilgrim",
            percentage_of_visitors: "15%",
            characteristics: {
                experience_level: "有极地或高海拔经验",
                physical_fitness: "良好",
                risk_tolerance: "中等",
                time_available: "3-7天",
                budget_usd: "2000-5000",
                motivations: ["内省和心灵体验", "极地环境的独特感受", "远离现代生活的干扰", "极光和精神追求"]
            },
            recommended_routes: [
                { route: "朗伊尔城温和活动", reason: "安全的基础体验，可适应极地环境", difficulty_match: "完美", season: "夏季（6-8月）" },
                { route: "船游和文化体验", reason: "有向导保护，体验极地文化", difficulty_match: "完美", season: "全年（极夜需特殊准备）" }
            ],
            critical_gate: "能接受无法独自漫步吗？（北极熊威胁）",
            not_recommended: ["独自探险（违法且致命）", "极夜期间无向导活动", "任何离开城镇的活动（必须有向导）"],
            preparation_needs: ["极地级保暖装备", "包含北极救援的保险（强制）", "心理准备（孤立感和极夜）", "向导服务（强制）"],
            expected_experiences: {
                physical_challenge: "低-中",
                isolation: "极高",
                natural_beauty: "极高",
                comfort_level: "低（极地环境）",
                spiritual_experience: "极高"
            }
        },
        {
            persona_id: "sj_persona_002",
            persona_name: "冒险寻求者",
            persona_name_en: "Adventure Seeker",
            percentage_of_visitors: "25%",
            characteristics: {
                experience_level: "有冒险活动经验",
                physical_fitness: "优秀",
                risk_tolerance: "高",
                time_available: "5-10天",
                budget_usd: "3000-8000",
                motivations: ["挑战极限", "冰川探险", "北极熊追踪", "极地穿越"]
            },
            recommended_routes: [
                { route: "冰川探险（有向导）", reason: "高难度但安全，有专业保护", difficulty_match: "完美", prerequisites: ["极地经验", "向导陪同"] },
                { route: "多日野外露营（有向导）", reason: "深度极地体验，但必须有专业向导", difficulty_match: "良好", prerequisites: ["极地经验", "向导陪同", "充足预算"] }
            ],
            critical_gate: "能接受完全由向导控制吗？（不能独立探险）",
            not_recommended: ["独立探险（违法）", "无向导的野外活动", "低估北极熊威胁"],
            preparation_needs: ["完整极地装备", "向导服务（强制）", "包含救援的保险", "极地生存培训"],
            expected_experiences: {
                physical_challenge: "高",
                adventure_level: "极高",
                risk_level: "高（但可控）",
                isolation: "极高"
            }
        },
        {
            persona_id: "sj_persona_003",
            persona_name: "文化猎奇者",
            persona_name_en: "Cultural Explorer",
            percentage_of_visitors: "10%",
            characteristics: {
                experience_level: "旅行经验丰富",
                physical_fitness: "中等",
                risk_tolerance: "低-中等",
                time_available: "3-5天",
                budget_usd: "2000-4000",
                motivations: ["了解极地文化", "体验独特的生活方式", "学习极地历史", "文化交流"]
            },
            recommended_routes: [
                { route: "朗伊尔城文化体验", reason: "安全，专注于文化学习", difficulty_match: "完美" },
                { route: "博物馆和定居点访问", reason: "深入了解极地历史和文化", difficulty_match: "完美" }
            ],
            critical_gate: "理解这不是普通旅游目的地吗？",
            not_recommended: ["任何野外活动（除非有向导）", "低估环境危险性"],
            preparation_needs: ["基础保暖装备", "旅游保险", "向导服务（如进行野外活动）"],
            expected_experiences: {
                cultural_immersion: "高",
                physical_challenge: "低",
                comfort_level: "中等",
                educational_value: "极高"
            }
        },
        {
            persona_id: "sj_persona_004",
            persona_name: "自然爱好者",
            persona_name_en: "Nature Lover",
            percentage_of_visitors: "20%",
            characteristics: {
                experience_level: "有自然观察经验",
                physical_fitness: "良好",
                risk_tolerance: "中等",
                time_available: "5-7天",
                budget_usd: "2500-5000",
                motivations: ["观察极地野生动物", "体验极地生态系统", "极光观察", "自然摄影"]
            },
            recommended_routes: [
                { route: "野生动物观察（有向导）", reason: "安全观察，有专业指导", difficulty_match: "完美" },
                { route: "极光之旅（有向导）", reason: "专业极光观察，安全有保障", difficulty_match: "完美", season: "极夜期间（10月-2月）" }
            ],
            critical_gate: "理解北极熊是真实威胁，不是观赏对象吗？",
            not_recommended: ["独自野生动物观察", "接近北极熊", "无向导的野外活动"],
            preparation_needs: ["保暖装备", "摄影设备（防寒）", "向导服务（强制）", "包含救援的保险"],
            expected_experiences: {
                wildlife_observation: "极高",
                natural_beauty: "极高",
                physical_challenge: "中",
                isolation: "高"
            }
        },
        {
            persona_id: "sj_persona_005",
            persona_name: "摄影师",
            persona_name_en: "Photographer",
            percentage_of_visitors: "12%",
            characteristics: {
                experience_level: "专业摄影经验",
                physical_fitness: "良好",
                risk_tolerance: "中等",
                time_available: "5-10天",
                budget_usd: "3000-6000",
                motivations: ["极地摄影", "极光摄影", "野生动物摄影", "风景摄影"]
            },
            recommended_routes: [
                { route: "极光摄影之旅（有向导）", reason: "专业极光拍摄，有向导保护", difficulty_match: "完美", season: "极夜期间" },
                { route: "野生动物摄影（有向导）", reason: "安全拍摄，有专业指导", difficulty_match: "完美" }
            ],
            critical_gate: "极光不是保证，你准备好失望吗？",
            not_recommended: ["独自野外摄影", "低估设备在极冷下的失效", "无向导的拍摄活动"],
            preparation_needs: ["专业摄影设备（防寒）", "备用电池（极冷下耗电快）", "向导服务（强制）", "包含救援的保险"],
            expected_experiences: {
                photography_opportunities: "极高",
                physical_challenge: "中",
                equipment_challenges: "高（极冷）",
                isolation: "高"
            }
        },
        {
            persona_id: "sj_persona_006",
            persona_name: "极地研究者",
            persona_name_en: "Polar Researcher",
            percentage_of_visitors: "8%",
            characteristics: {
                experience_level: "专业研究经验",
                physical_fitness: "优秀",
                risk_tolerance: "高",
                time_available: "1-4周",
                budget_usd: "5000-15000+",
                motivations: ["科学研究", "数据收集", "学术研究", "专业考察"]
            },
            recommended_routes: [
                { route: "研究站访问", reason: "专业研究设施", difficulty_match: "完美" },
                { route: "长期野外研究（有向导）", reason: "深度研究，但必须有专业支持", difficulty_match: "完美" }
            ],
            critical_gate: "有专业研究许可和支持吗？",
            not_recommended: ["无许可的研究活动", "无专业支持的研究"],
            preparation_needs: ["研究许可", "专业装备", "研究支持团队", "包含救援的保险"],
            expected_experiences: {
                research_opportunities: "极高",
                physical_challenge: "高",
                isolation: "极高",
                professional_support: "必需"
            }
        },
        {
            persona_id: "sj_persona_007",
            persona_name: "家庭游客",
            persona_name_en: "Family Traveler",
            percentage_of_visitors: "5%",
            characteristics: {
                experience_level: "家庭旅行经验",
                physical_fitness: "中等",
                risk_tolerance: "低",
                time_available: "3-5天",
                budget_usd: "3000-6000",
                motivations: ["家庭体验", "教育孩子", "独特经历", "家庭回忆"]
            },
            recommended_routes: [
                { route: "朗伊尔城温和活动", reason: "安全，适合家庭", difficulty_match: "完美" },
                { route: "博物馆和教育体验", reason: "教育价值高，安全", difficulty_match: "完美" }
            ],
            critical_gate: "儿童年龄足够吗？（不推荐<8岁）",
            not_recommended: ["任何野外活动（儿童禁止）", "极夜期间（对儿童太困难）", "独自活动"],
            preparation_needs: ["儿童专用装备", "家庭保险", "向导服务（如进行活动）", "医疗准备"],
            expected_experiences: {
                family_experience: "高",
                educational_value: "极高",
                physical_challenge: "低",
                safety_level: "高（在城镇内）"
            }
        },
        {
            persona_id: "sj_persona_008",
            persona_name: "极限挑战者",
            persona_name_en: "Extreme Challenger",
            percentage_of_visitors: "5%",
            characteristics: {
                experience_level: "多次极地经验",
                physical_fitness: "优秀（专业水平）",
                risk_tolerance: "极高",
                time_available: "1-3周",
                budget_usd: "8000-20000+",
                motivations: ["极限挑战", "自我超越", "极地穿越", "记录挑战"]
            },
            recommended_routes: [
                { route: "多日极地穿越（有向导）", reason: "最高难度，但必须有专业支持", difficulty_match: "完美", prerequisites: ["多次极地经验", "专业向导", "完整装备"] },
                { route: "极夜挑战（有向导）", reason: "心理和身体双重挑战", difficulty_match: "完美", prerequisites: ["极地经验", "心理准备", "专业向导"] }
            ],
            critical_gate: "有足够的极地经验和专业支持吗？",
            not_recommended: ["无向导的极限活动", "低估风险", "无充分准备"],
            preparation_needs: ["完整极地装备", "专业向导（强制）", "完整保险", "极地生存培训", "心理准备"],
            expected_experiences: {
                physical_challenge: "极端",
                mental_challenge: "极端",
                risk_level: "极高",
                isolation: "极高",
                achievement: "极高"
            }
        }
    ],
    persona_assessment_tool: {
        how_to_use: "回答以下问题确定你的画像和是否适合斯瓦尔巴",
        questions: [
            {
                q1: "你的极地经验如何？",
                answers: {
                    "无经验": "极地朝圣者/文化猎奇者",
                    "有1-2次极地经验": "自然爱好者/摄影师",
                    "多次极地经验": "冒险寻求者/极限挑战者"
                }
            },
            {
                q2: "你的主要动机是什么？",
                answers: {
                    "内省和精神体验": "极地朝圣者",
                    "冒险和挑战": "冒险寻求者/极限挑战者",
                    "文化和学习": "文化猎奇者",
                    "自然观察": "自然爱好者",
                    "摄影": "摄影师",
                    "研究": "极地研究者",
                    "家庭体验": "家庭游客"
                }
            },
            {
                q3: "你能接受的风险水平？",
                answers: {
                    "低风险，安全第一": "文化猎奇者/家庭游客",
                    "中等风险，有保护": "极地朝圣者/自然爱好者/摄影师",
                    "高风险，有专业支持": "冒险寻求者",
                    "极高风险，专业挑战": "极限挑战者"
                }
            }
        ]
    },
    red_flags: {
        medical: ["心脏病或心血管疾病", "严重的呼吸系统疾病", "未控制的高血压", "严重的关节炎或行动不便", "最近的手术或恢复期"],
        psychological: ["季节性抑郁症(SAD)史", "严重的焦虑症", "幽闭恐怖症", "心理健康危机期"],
        practical: ["无有效护照或签证", "无旅游保险或保险不足", "预算明显不足(< 2000 USD for week)", "固定日期依赖(会因天气被取消)"],
        safety: ["不理解北极熊风险", "期望独自探险", "年龄过小(< 8岁)或过大(> 75岁+ 体弱)", "曾在极端环境中失败或受伤"]
    },
    ai_decision_logic: {
        persona_identification: {
            step_1: "通过问答确定用户画像",
            step_2: "匹配推荐路线",
            step_3: "强调准备需求和风险",
            step_4: "应用安全第一原则检查",
            step_5: "应用决策矩阵评估"
        },
        safety_first_principle: "当用户画像与路线不匹配时，AI必须明确劝阻，即使用户坚持。对于斯瓦尔巴，安全优先于体验。",
        key_decisions: [
            "用户是否理解斯瓦尔巴是极地环境，不是普通旅游？",
            "用户是否理解北极熊的真实威胁？",
            "用户是否有足够的极地经验或专业支持？",
            "用户是否理解极夜对心理的影响？",
            "用户是否有医疗和保险覆盖？",
            "用户是否应该现在来斯瓦尔巴？"
        ]
    },
    decision_matrix: {
        GO_FULLY_SUPPORTED: {
            description: "用户完全适合，鼓励前往",
            criteria: [
                "通过所有安全门槛",
                "有现实的期望",
                "准备充足（装备、保险、预算、向导）",
                "理解极地环境的风险",
                "理解北极熊威胁"
            ],
            support_level: "完整支持，优化体验"
        },
        GO_WITH_STRONG_CAUTION: {
            description: "用户可以去，但需要特别指导",
            criteria: [
                "有某些风险因素（如经验不足、年龄）",
                "但心理准备充足",
                "愿意听从建议",
                "有向导支持"
            ],
            support_level: "密集支持，严格监督"
        },
        GO_ALTERNATIVE_PLAN: {
            description: "用户不适合标准路线，推荐替代方案",
            examples: [
                "太年轻 → 建议成年后再来",
                "极夜难适应 → 建议夏季",
                "预算不足 → 建议先去冰岛存钱",
                "无极地经验 → 建议参加培训"
            ]
        },
        STRONGLY_RECONSIDER: {
            description: "用户可能不应该现在来",
            criteria: [
                "安全风险太高",
                "心理准备不足",
                "有不可接受的医学禁忌症",
                "期望与现实差距太大",
                "不理解极地环境的致命风险"
            ],
            recommendation: "延期1-2年，改目的地，或重新评估"
        },
        NOT_RECOMMENDED: {
            description: "用户不应该来斯瓦尔巴",
            criteria: [
                "严重的医学禁忌症",
                "无法接受致命风险",
                "完全无法负担",
                "心理状况不稳定",
                "不理解北极熊风险",
                "期望独自探险（违法且致命）"
            ],
            recommendation: "强烈建议改目的地（如冰岛、挪威）"
        }
    },
    comparison_with_iceland: {
        iceland_approach: "优化体验和满足度 - 大多数人可以去，需要找到适合的方式",
        svalbard_approach: "确保安全和生存 - 不是所有人都应该来，筛选不适合者很重要"
    },
    data_provenance: {
        sources: ["Visit Svalbard官方数据", "北极探险公司反馈", "极地向导安全记录", "用户体验研究"],
        credibility_notes: "基于官方数据和专业向导经验，但个人经验因个体差异而异",
        last_review: "2026-01-31",
        next_review: "2026-04-30"
    }
};
//# sourceMappingURL=svalbard-personas.config.js.map