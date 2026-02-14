"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GREENLAND_USER_PERSONAS = void 0;
exports.GREENLAND_USER_PERSONAS = {
    metadata: {
        version: "1.0.0",
        last_updated: "2026-01-23",
        description: "格陵兰探险者用户画像系统",
        credibility_score: 0.93,
        language: "zh-CN"
    },
    overview: {
        purpose: "帮助用户快速识别自己属于哪种探险者类型，从而判断适合哪些路线",
        philosophy: "判断而非规划 - 理解自己的能力边界比规划行程更重要"
    },
    user_personas: [
        {
            persona_id: "grl_persona_001",
            persona_name: "首次极地访问者",
            persona_name_en: "First-Time Arctic Visitor",
            percentage_of_visitors: "60%",
            characteristics: {
                experience_level: "无或极少极地经验",
                physical_fitness: "中等（日常运动）",
                risk_tolerance: "低-中等",
                time_available: "3-7天",
                budget_dkk: "10000-30000",
                motivations: [
                    "看到格陵兰冰山和冰川",
                    "体验不一样的旅行",
                    "摄影和视觉震撼",
                    "文化体验"
                ]
            },
            recommended_routes: [
                {
                    route: "伊卢利萨特冰峡湾（船游版）",
                    reason: "最安全、最壮观、最易接近",
                    difficulty_match: "完美"
                },
                {
                    route: "迪斯科湾船游",
                    reason: "浮冰和鲸鱼观察，相对安全",
                    difficulty_match: "良好"
                },
                {
                    route: "西格陵兰定居点访问",
                    reason: "文化体验，零风险",
                    difficulty_match: "完美"
                }
            ],
            not_recommended: [
                "东格陵兰荒野",
                "多日皮划艇探险",
                "冰盖穿越"
            ],
            preparation_needs: [
                "基本的保暖衣物（可在当地租赁）",
                "防晕船药（如需要）",
                "极地旅游保险",
                "相机和备用电池"
            ],
            expected_experiences: {
                physical_challenge: "低",
                cultural_immersion: "中",
                natural_beauty: "极高",
                comfort_level: "中-高（酒店住宿）"
            },
            typical_itinerary: {
                day_1: "抵达伊卢利萨特，定居点探索",
                day_2: "冰峡湾船游",
                day_3: "迪斯科湾一日游",
                day_4_5: "自由活动、博物馆、徒步",
                day_6: "返回"
            },
            success_factors: [
                "保持开放心态",
                "接受天气可能导致计划变化",
                "跟随向导指示",
                "享受过程而非追求极限"
            ]
        },
        {
            persona_id: "grl_persona_002",
            persona_name: "探险爱好者",
            persona_name_en: "Adventure Enthusiast",
            percentage_of_visitors: "30%",
            characteristics: {
                experience_level: "有登山、徒步或皮划艇经验",
                physical_fitness: "高（定期高强度运动）",
                risk_tolerance: "中-高",
                time_available: "1-3周",
                budget_dkk: "30000-80000",
                motivations: [
                    "挑战自我",
                    "深度自然体验",
                    "远离人群的荒野",
                    "野外生存技能应用"
                ]
            },
            recommended_routes: [
                {
                    route: "迪斯科湾多日皮划艇",
                    reason: "有一定挑战但风险可控",
                    difficulty_match: "良好",
                    prerequisites: ["中级皮划艇技能", "冷水装备"]
                },
                {
                    route: "西格陵兰徒步路线",
                    reason: "美丽的徒步体验，适度挑战",
                    difficulty_match: "完美"
                },
                {
                    route: "伊卢利萨特冰峡湾（皮划艇版）",
                    reason: "冰山间皮划艇，需要技能",
                    difficulty_match: "良好"
                }
            ],
            stretch_goals: [
                {
                    route: "Liverpool Land（东格陵兰入门）",
                    condition: "如有向导和充分准备",
                    note: "仍是极端挑战，需要慎重评估"
                }
            ],
            not_recommended: [
                "东北格陵兰国家公园（需要更多经验）",
                "独立冰盖穿越"
            ],
            preparation_needs: [
                "极地级装备（干衣、保温靴、多层系统）",
                "皮划艇或徒步技能提升",
                "北极熊防御基础知识",
                "野外医疗急救培训（WFA级别）",
                "体能训练（每周15+ 小时）"
            ],
            expected_experiences: {
                physical_challenge: "高",
                cultural_immersion: "低-中",
                natural_beauty: "极高",
                comfort_level: "低（露营）",
                self_reliance: "中-高"
            },
            typical_itinerary: {
                week_1: "伊卢利萨特适应 + 基础皮划艇",
                week_2: "迪斯科湾多日皮划艇探险",
                week_3: "西格陵兰徒步或返回"
            },
            success_factors: [
                "诚实评估自己的技能",
                "不要低估极地环境",
                "团队协作至关重要",
                "尊重自然和向导建议",
                "做好心理准备应对辛苦"
            ],
            transition_path: {
                to_expert: [
                    "积累2-3次格陵兰经验",
                    "参加极地培训课程",
                    "获得高级野外医疗认证",
                    "参加东格陵兰准备远征"
                ]
            }
        },
        {
            persona_id: "grl_persona_003",
            persona_name: "极地探险家",
            persona_name_en: "Polar Expedition Expert",
            percentage_of_visitors: "10%",
            characteristics: {
                experience_level: "多次北极/南极经验",
                physical_fitness: "卓越（专业运动员级别）",
                risk_tolerance: "高（可接受致命风险）",
                time_available: "3周-3个月",
                budget_dkk: "100000-300000+",
                motivations: [
                    "终极极地挑战",
                    "探索未知荒野",
                    "科学研究或纪录片",
                    "自我超越"
                ]
            },
            recommended_routes: [
                {
                    route: "东格陵兰荒野远征",
                    reason: "世界级挑战",
                    difficulty_match: "完美",
                    prerequisites: ["多年经验", "专业装备", "团队支持"]
                },
                {
                    route: "东北格陵兰国家公园",
                    reason: "终极荒野",
                    difficulty_match: "完美",
                    note: "需要特殊许可和极高自给自足"
                },
                {
                    route: "格陵兰冰盖穿越",
                    reason: "历史性远征",
                    difficulty_match: "完美"
                }
            ],
            required_qualifications: [
                "至少3次以上极地探险经历",
                "冰川救援认证",
                "高级野外医疗（WFR或WEMT）",
                "北极熊防御和枪支培训",
                "卫星通讯和导航专家级",
                "团队领导经验"
            ],
            preparation_needs: [
                "专业级极地装备（投资50000+ DKK）",
                "6-12个月体能和技能训练",
                "团队组建和协调",
                "详细后勤和应急计划",
                "多重保险（包括撤离）"
            ],
            expected_experiences: {
                physical_challenge: "极端",
                mental_challenge: "极端",
                isolation: "极高（数周不遇人）",
                danger_level: "致命风险存在",
                reward: "一生难忘的成就"
            },
            typical_expedition: {
                duration: "20-40天",
                team_size: "4-8人",
                daily_routine: [
                    "早晨风险评估",
                    "8-10小时探险活动",
                    "营地建立和防御",
                    "轮班警戒"
                ],
                challenges_faced: [
                    "北极熊遭遇",
                    "极端天气",
                    "装备故障",
                    "心理压力",
                    "体能极限"
                ]
            },
            success_factors: [
                "充分准备和冗余计划",
                "团队信任和沟通",
                "保守的风险评估",
                "尊重自然的力量",
                "知道何时撤退"
            ],
            reality_check: {
                success_rate: "85%（完成探险）",
                incident_rate: "15%（需要应急响应）",
                fatality_risk: "真实存在但罕见",
                note: "这不是游戏，是真正的生存挑战"
            }
        }
    ],
    persona_assessment_tool: {
        how_to_use: "回答以下问题确定你的画像",
        questions: [
            {
                q1: "你有多少次极地或高海拔经验？",
                answers: {
                    "0-1次": "首次访问者",
                    "2-4次": "探险爱好者",
                    "5次以上": "极地探险家"
                }
            },
            {
                q2: "你的体能水平？",
                answers: {
                    "日常散步": "首次访问者",
                    "定期健身/运动": "探险爱好者",
                    "专业运动员级别": "极地探险家"
                }
            },
            {
                q3: "你能接受的风险水平？",
                answers: {
                    "低风险，有安全保障": "首次访问者",
                    "中等风险，有专业向导": "探险爱好者",
                    "高风险，包括致命可能": "极地探险家"
                }
            },
            {
                q4: "你的预算范围（DKK）？",
                answers: {
                    "10000-30000": "首次访问者",
                    "30000-80000": "探险爱好者",
                    "100000+": "极地探险家"
                }
            },
            {
                q5: "你有哪些特殊技能？",
                answers: {
                    "无特殊技能": "首次访问者",
                    "皮划艇/登山/野外生存": "探险爱好者",
                    "冰川救援/医疗急救/北极熊防御": "极地探险家"
                }
            }
        ]
    },
    cross_persona_advice: {
        upgrading_skills: {
            from_beginner_to_enthusiast: [
                "完成至少1次格陵兰首次访问",
                "参加皮划艇或登山培训",
                "获得WFA野外医疗急救认证",
                "积累体能（每周10+ 小时训练）"
            ],
            from_enthusiast_to_expert: [
                "完成2-3次高难度格陵兰探险",
                "参加极地专业培训（北极熊、冰川）",
                "获得WFR或WEMT认证",
                "参加斯瓦尔巴或南极远征",
                "组建可信赖的团队"
            ]
        },
        common_mistakes: [
            {
                mistake: "高估自己的能力",
                consequence: "危险境地或救援",
                prevention: "诚实评估，从简单路线开始"
            },
            {
                mistake: "低估极地环境",
                consequence: "失温、冻伤、迷路",
                prevention: "充分研究和准备"
            },
            {
                mistake: "忽视心理准备",
                consequence: "恐慌、放弃、团队冲突",
                prevention: "心理韧性训练和现实预期"
            }
        ]
    },
    ai_decision_logic: {
        persona_identification: {
            step_1: "通过问答确定用户画像",
            step_2: "匹配推荐路线",
            step_3: "强调准备需求和风险",
            step_4: "提供升级路径（如适用）"
        },
        safety_first_principle: "当用户画像与路线不匹配时，AI必须明确劝阻"
    },
    red_flags: {
        medical: [
            "严重的心脏病或心血管疾病",
            "严重的呼吸系统疾病（哮喘、COPD等）",
            "未控制的高血压",
            "严重的关节炎或行动不便",
            "最近的手术或恢复期",
            "对寒冷极度敏感（雷诺氏症等）"
        ],
        psychological: [
            "严重的焦虑症或恐慌症",
            "幽闭恐怖症",
            "心理健康危机期",
            "无法应对孤立和极端环境"
        ],
        practical: [
            "无有效护照或签证",
            "无旅游保险或保险不足（格陵兰救援昂贵）",
            "预算明显不足(< 10000 DKK for week)",
            "固定日期依赖（天气可能导致计划变化）",
            "无法接受行程变更"
        ],
        safety: [
            "无极地经验但选择高难度活动",
            "不理解冰川和浮冰的危险",
            "期望独自进行野外活动",
            "年龄过小(< 12岁)或过大(> 70岁+ 体弱)",
            "曾在极地环境中失败或受伤",
            "不尊重当地文化和环境"
        ]
    },
    decision_matrix: {
        GO_FULLY_SUPPORTED: {
            description: "用户完全适合，鼓励前往",
            criteria: [
                "通过所有安全门槛",
                "有现实的期望",
                "准备充足（装备、保险、预算）",
                "理解极地环境的风险"
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
                "经验不足 → 建议船游和温和活动",
                "预算不足 → 建议缩短行程或选择更经济的活动",
                "体力有限 → 建议缆车+步行的混合路线"
            ]
        },
        STRONGLY_RECONSIDER: {
            description: "用户可能不应该现在来",
            criteria: [
                "安全风险较高",
                "心理准备不足",
                "有不可接受的医学禁忌症",
                "期望与现实差距太大"
            ],
            recommendation: "延期1-2年，改目的地，或重新评估"
        },
        NOT_RECOMMENDED: {
            description: "用户不应该来格陵兰",
            criteria: [
                "严重的医学禁忌症",
                "无法接受极地环境风险",
                "完全无法负担",
                "心理状况不稳定"
            ],
            recommendation: "强烈建议改目的地（如冰岛、挪威）"
        }
    },
    data_provenance: {
        sources: [
            "格陵兰旅游统计数据",
            "探险公司客户档案分析",
            "极地探险协会专家访谈"
        ],
        last_review: "2026-01-23",
        next_review: "2026-07-23"
    }
};
//# sourceMappingURL=greenland-personas.config.js.map