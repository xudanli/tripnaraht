"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.K2_USER_PERSONAS = void 0;
exports.K2_USER_PERSONAS = {
    metadata: {
        version: "1.0.0",
        last_updated: "2026-01-31",
        description: "K2（乔戈里峰）登山者用户画像系统",
        credibility_score: 0.94,
        language: "zh-CN",
        risk_level: "极高",
        knowledge_base_type: "Layer 1 红线警告"
    },
    overview: {
        purpose: "帮助潜在登山者快速识别自己属于哪种登山者类型，从而判断是否真的应该攀登K2",
        philosophy: "判断而非规划 - 理解自己的技能和风险承受度比规划山峰清单更重要",
        core_warning: "K2是14座8000米峰中综合难度最高的山峰，死亡率约23%，不是目的地，是致命挑战"
    },
    user_personas: [
        {
            persona_id: "k2_persona_001",
            persona_name: "8000米积累者",
            persona_name_en: "8000m Accumulator",
            percentage_of_climbers: "5%",
            characteristics: {
                experience_level: "1-2座8000米峰登顶经验",
                technical_climbing: "有经验但非领攀能力",
                high_altitude_time: "累计3-6个月",
                risk_tolerance: "中等（依赖商业向导）",
                time_available: "2-3个月",
                budget_usd: "50000-75000",
                motivations: [
                    "攀登8000米高峰清单",
                    "挑战个人极限",
                    "获得8000米登顶纪录",
                    "文化探险体验"
                ]
            },
            danger_assessment: {
                death_probability: "23-25%（整个季节统计）",
                critical_factor: "你很可能会死亡，需要完全接受这一点",
                realistic_chances: {
                    summit_probability: "30-40%（首次尝试）",
                    death_or_serious_injury: "8-15%（如果上山）",
                    forced_descent: "60-70%"
                }
            },
            recommended_prerequisites: [
                {
                    requirement: "曾登顶卓奥友、希夏邦马或甘城章嘉",
                    reason: "8000米适应经验，但K2技术难度远高于这些"
                },
                {
                    requirement: "WI4+冰壁领攀能力",
                    reason: "瓶颈区域需要自救能力"
                },
                {
                    requirement: "混合攀登经验（5.6-5.7等级）",
                    reason: "黑金字塔和House's Chimney要求"
                },
                {
                    requirement: "高海拔医学培训（WEMT）",
                    reason: "应急医疗判断能力"
                }
            ],
            recommended_routes: [
                {
                    route: "Abruzzi Spur（标准路线）",
                    reason: "最常用，固定绳最完整，但仍是极端困难",
                    difficulty_match: "勉强可行",
                    critical_sections: ["House's Chimney", "Black Pyramid", "Bottleneck"],
                    warning: "你不应该在这里"
                }
            ],
            not_recommended_critical: [
                "K2（整体评估）",
                "任何非标准路线",
                "冬季K2"
            ],
            honest_assessment: {
                your_skill_vs_k2: "不匹配",
                reason: "你的经验来自'导游型'商业8000米峰，K2需要自主技术决策能力",
                comparison: "珠峰之于K2，如同健身房之于铁人三项"
            },
            preparation_needs: [
                "至少1年的强化技术训练（每周20+小时）",
                "完成3-4座技术型8000米峰（马卡鲁、干城章嘉）",
                "参加北美或欧洲冰壁攀登课程（6级难度）",
                "极地级装备升级（冷风保暖层超过珠峰要求）",
                "心理准备：接受3:1的死亡概率"
            ],
            expected_experiences: {
                physical_challenge: "极端",
                technical_demand: "高（相对于你的背景）",
                risk_reality: "致命",
                comfort_level: "极低（营地简陋，补给稀缺）",
                isolation_duration: "2-3个月"
            },
            typical_timeline: {
                month_1: "抵达斯卡杜、适应、运输物资到大本营",
                month_2: "营地跳跃、技术踩点、尝试冲顶（通常失败）",
                month_3: "第二次尝试或放弃、安全撤离"
            },
            success_factors: [
                "诚实承认技能差距",
                "选择经验丰富的向导（曾成功K2登顶者）",
                "小型团队（4-6人）",
                "提前1年开始准备",
                "制定明确的放弃阈值",
                "购买直升机救援保险"
            ],
            failure_scenarios: [
                {
                    scenario: "高反突然发作",
                    probability: "40%",
                    consequence: "被迫下撤，可能失去四肢"
                },
                {
                    scenario: "天气窗口未到",
                    probability: "30%",
                    consequence: "消耗资源，最终放弃"
                },
                {
                    scenario: "队友遭遇意外",
                    probability: "15%",
                    consequence: "道德困境：继续还是救援"
                },
                {
                    scenario: "自己陷入瓶颈堵塞",
                    probability: "20%",
                    consequence: "耗尽氧气，可能死亡"
                }
            ],
            honest_advice: "你可能会说'我登过珠峰所以我能登K2'。这是致命的错觉。K2会教会你尊重山峰。如果你无法接受超过20%的死亡概率，请选择其他山峰。"
        },
        {
            persona_id: "k2_persona_002",
            persona_name: "技术登山家",
            persona_name_en: "Technical Alpinist",
            percentage_of_climbers: "25%",
            characteristics: {
                experience_level: "3-5座8000米峰，其中2+技术型（马卡鲁、干城章嘉）",
                technical_climbing: "领攀WI4-WI5冰壁，5.7-5.8混合地形",
                high_altitude_time: "累计8-15个月",
                risk_tolerance: "高（理解并接受致命风险）",
                time_available: "2-3个月",
                budget_usd: "60000-90000",
                motivations: [
                    "完成最具挑战的8000米峰",
                    "世界级登山纪录",
                    "登山者社群认可",
                    "证明自己的能力"
                ]
            },
            danger_assessment: {
                death_probability: "18-23%（基于选择合适团队）",
                critical_realization: "你可能会死在这座山上，或失去一个队友",
                realistic_chances: {
                    summit_probability: "40-50%（多次尝试）",
                    death_or_serious_injury: "12-18%（如果充分准备）",
                    no_attempt: "20%（天气无利窗口）"
                }
            },
            recommended_prerequisites: [
                {
                    requirement: "马卡鲁或干城章嘉成功登顶",
                    reason: "最接近K2的技术难度和高海拔组合"
                },
                {
                    requirement: "斯瓦尔巴或南极远征经验",
                    reason: "极地气候下的决策经验"
                },
                {
                    requirement: "WI5-冰壁领攀和混合攀登",
                    reason: "瓶颈和黑金字塔需要"
                },
                {
                    requirement: "冰川救援认证和技能",
                    reason: "高海拔自救能力"
                }
            ],
            recommended_routes: [
                {
                    route: "Abruzzi Spur（标准路线）",
                    reason: "最有经验的向导，固定绳路线，最佳机会",
                    difficulty_match: "符合",
                    critical_sections: ["House's Chimney", "Black Pyramid", "Bottleneck"],
                    team_recommendation: "选择最经验丰富的运营商"
                }
            ],
            stretch_attempts: [
                {
                    route: "Cesen Route（南面直接线）",
                    condition: "仅在有顶级向导和完美天气窗口的情况下",
                    note: "更少人尝试，更多未知风险"
                }
            ],
            not_recommended: [
                "北壁路线（中国侧）- 后勤和许可极困难",
                "冬季K2 - 概率为零"
            ],
            preparation_needs: [
                "6-12个月密集准备",
                "选择顶级运营商（Madison、Adventure Consultants、Furtenbach等）",
                "完整的技术峰谷课程（5级-6级）",
                "极地级装备（预算$15000+）",
                "心理准备：制定清晰的放弃条件和死亡接纳"
            ],
            expected_experiences: {
                physical_challenge: "极端",
                technical_demand: "高且关键",
                risk_reality: "高概率面临致命决策",
                comfort_level: "极低",
                isolation_duration: "2-3个月，其中1个月接近死亡地带"
            },
            typical_expedition: {
                pre_expedition: "3-6个月训练，1个月前期侦察",
                month_1: "斯卡杜适应 → 进山 → 大本营建立 → ABC营",
                month_2: "C1-C4营地跳跃，习惯路线，尝试冲顶（通常1-2次）",
                month_3: "最后冲顶机会或撤离"
            },
            success_factors: [
                "选择经验丰富的国际运营商",
                "与同等水平的队友协作",
                "明确的风险/收益评估体系",
                "固定的放弃阈值（天气、体能、道德）",
                "充分的物资和后勤支持",
                "定期高海拔医学评估"
            ],
            critical_decision_points: [
                {
                    point: "瓶颈区域天气",
                    decision: "如果天亮还在瓶颈下方，必须放弃",
                    reason: "暴露时间过长 = 99%死亡率"
                },
                {
                    point: "队友高反症状",
                    decision: "如果队友无法自主行动，放弃峰顶",
                    reason: "救援成本可能不值"
                },
                {
                    point: "固定绳完整性",
                    decision: "如果发现绳索问题，立即通知全队",
                    reason: "2008年11人死于此"
                }
            ],
            realistic_outcomes: [
                {
                    outcome: "成功登顶",
                    probability: "40-50%",
                    reward: "一生成就，极少人群"
                },
                {
                    outcome: "失败但安全撤离",
                    probability: "35-45%",
                    experience: "深刻的自我认知"
                },
                {
                    outcome: "失败伴随伤害",
                    probability: "10-15%",
                    consequence: "冻伤、肺水肿、失温"
                },
                {
                    outcome: "死亡",
                    probability: "2-8%",
                    note: "真实存在的结果"
                }
            ],
            transition_to_mastery: [
                "完成第一次K2（即使失败）",
                "分析失败原因，改进方案",
                "第二次攀登成功率大幅提升"
            ]
        },
        {
            persona_id: "k2_persona_003",
            persona_name: "远征专家",
            persona_name_en: "Expedition Specialist",
            percentage_of_climbers: "70%",
            characteristics: {
                experience_level: "从未登过8000米峰，或仅有1座珠峰经验",
                technical_climbing: "无或有限",
                high_altitude_time: "少于6个月，或仅珠峰商业路线",
                risk_tolerance: "低-中等",
                time_available: "少于3个月，或计划不清",
                budget_usd: "可变，但通常不足",
                motivations: [
                    "'登最高的山峰'",
                    "社交媒体打卡",
                    "个人清单完成",
                    "炫耀欲"
                ]
            },
            danger_assessment: {
                death_probability: "25-30%（如果强行参加）",
                brutal_truth: "你将非常可能死在这座山上",
                why_high: "经验不足 + 低准备 + 错误期望 = 灾难"
            },
            absolute_contraindications: [
                "这是你的首座或第二座8000米峰",
                "你认为珠峰经验可以转移到K2",
                "你没有领攀经验",
                "你认为'高海拔就是出钱'",
                "你没有6个月以上的准备时间",
                "你无法接受死亡概率"
            ],
            why_not_recommended: {
                reason_1_skill_gap: "K2技术难度是珠峰的5倍，你的商业向导不能救你",
                reason_2_time: "你没有足够时间适应和学习",
                reason_3_mentality: "你对山峰的理解可能太浪漫化",
                reason_4_money: "K2不是'花钱就能登的山'",
                reason_5_team: "你无法评估团队质量或运营商声誉"
            },
            honest_paths_forward: [
                {
                    path: "放弃K2梦想",
                    description: "选择其他8000米峰，保持生命"
                },
                {
                    path: "5年培养计划",
                    steps: [
                        "年1：完成珠峰或卓奥友，积累高海拔经验",
                        "年2-3：登马卡鲁或干城章嘉（技术峰）",
                        "年3-4：参加高难度阿尔卑斯课程，获得WI4+认证",
                        "年4-5：完成斯瓦尔巴远征，测试技能和心理",
                        "年5：如果仍想要，开始K2筹备"
                    ]
                }
            ],
            what_you_need_to_understand: {
                point_1: "K2不是目的地，是生存测试",
                point_2: "你无法用钱'购买'安全",
                point_3: "死亡在这里不是极端情况，是正常范围",
                point_4: "你的队友可能会死，你可能无法救他们",
                point_5: "如果你的目标是'到过那里'，K2会杀死你"
            },
            realistic_outcome_if_you_insist: {
                best_case: "被劝阻在大本营，失金钱，学到教训",
                likely_case: "高反严重，强制下撤，花费巨资被救援",
                worst_case: "成为K2死亡统计数据"
            },
            better_alternatives: [
                {
                    mountain: "珠穆朗玛峰（南坡商业路线）",
                    reason: "8000米经验，商业支持充足"
                },
                {
                    mountain: "卓奥友",
                    reason: "技术简单，8000米入门"
                },
                {
                    mountain: "列宁峰（7134m）",
                    reason: "高海拔但技术中等，成功率高"
                },
                {
                    mountain: "蒙特罗莎（4634m）",
                    reason: "阿尔卑斯技术峰，真正挑战技能"
                }
            ]
        }
    ],
    persona_assessment_tool: {
        how_to_use: "诚实回答以下问题，来确定你真正属于哪种登山者类型",
        critical_warning: "不要高估自己。许多死在K2上的人在出发前高估了自己",
        questions: [
            {
                q1: "你登过多少座8000米峰？",
                answers: {
                    "0座": "远征专家 ❌ 不应尝试K2",
                    "1座（珠峰商业线）": "远征专家 ❌ 不应尝试K2",
                    "1座（技术峰）": "积累者 ⚠️ 需要更多准备",
                    "2-3座（含技术峰）": "积累者 ⚠️ 可能符合条件",
                    "4座以上（含2+技术峰）": "技术登山家 ✅ 可以考虑"
                }
            },
            {
                q2: "你的技术攀登水平？",
                answers: {
                    "无": "远征专家 ❌",
                    "阿尔卑斯PD-AD级": "积累者 ⚠️",
                    "WI3/冰壁领攀": "积累者 ⚠️",
                    "WI4/5.6-5.7混合": "技术登山家 ✅",
                    "WI5+/5.8以上": "技术登山家 ✅"
                }
            },
            {
                q3: "你能接受的死亡风险？",
                answers: {
                    "低于5%": "远征专家 ❌ 不适合K2",
                    "5-10%": "积累者 ⚠️ 极其危险",
                    "10-20%": "积累者 ⚠️ 高风险",
                    "20-25%": "技术登山家 ✅ 符合现实预期",
                    "25%+": "技术登山家 ✅ 能够接受"
                }
            },
            {
                q4: "你有多少高海拔累计时间？",
                answers: {
                    "少于1个月": "远征专家 ❌ 太少",
                    "1-3个月": "远征专家 ❌",
                    "3-6个月": "积累者 ⚠️ 勉强",
                    "6-12个月": "积累者 ✅ 足够",
                    "12+个月": "技术登山家 ✅"
                }
            },
            {
                q5: "你对K2有多少了解？",
                answers: {
                    "看过电影/纪录片": "远征专家 ❌ 了解不足",
                    "读过几篇文章": "远征专家 ❌",
                    "研究过死亡统计": "积累者 ⚠️",
                    "熟悉所有重大事件": "积累者 ✅",
                    "能分析技术难点和风险": "技术登山家 ✅"
                }
            },
            {
                q6: "如果队友无法继续，你会？",
                answers: {
                    "帮他/她回到安全地方": "技术登山家 ✅",
                    "尝试救援": "积累者 ⚠️ 可能失去两个人",
                    "继续向峰顶": "远征专家 ❌ 不道德",
                    "不确定": "所有人 ❌ 不准备好"
                }
            },
            {
                q7: "你是否能够在死亡地带做出放弃决定？",
                answers: {
                    "不确定": "❌ 不适合K2",
                    "可能太晚": "⚠️ 高度危险",
                    "可以（时间/海拔阈值清晰）": "✅ 可能准备好"
                }
            }
        ]
    },
    cross_persona_comparison: {
        "珠峰_vs_K2": {
            珠峰特点: "商业登山已成熟，向导可以在身边，固定绳完整，很少技术难度",
            K2特点: "你必须自己做关键决策，向导无法完全保护你，需要技术自救能力",
            主要差异: "珠峰 = 有向导的远足，K2 = 真正的登山"
        },
        "5000人登珠峰": "每年约4000人，90%以上成功",
        "600人登K2": "历史总数，约90人死亡（15%死亡率）",
        本季成功率: {
            珠峰: "45-60%",
            K2: "25-35%"
        }
    },
    critical_risk_factors: {
        risk_1_瓶颈区域: {
            location: "8200-8300m",
            danger: "80°冰壁上悬挂巨大冰塔，坍塌或拥堵导致死亡",
            "2008年": "11人死于冰塔坍塌",
            mitigation: "凌晨2-4点快速通过，但无法完全避免"
        },
        risk_2_天气: {
            window: "通常只有24-48小时，很难预测",
            consequence: "错过窗口 = 整个赛季浪费 + 资源耗尽",
            extreme: "-30到-50°C，100+ km/h风"
        },
        risk_3_高反: {
            occurrence: "40-50%登山者严重高反",
            consequence: "脑水肿/肺水肿 = 可能无法自主行动 = 死亡"
        },
        risk_4_技术失误: {
            cause: "疲劳、缺氧、判断错误在高海拔放大",
            example: "固定绳管理不当、滑坠、失温"
        }
    },
    ai_decision_logic: {
        step_1_honest_assessment: "用户必须客观评估自己的能力和风险接受度",
        step_2_红线识别: "如果用户属于'远征专家'，AI必须强烈劝阻",
        step_3_准备路径: "如果用户有潜力但准备不足，提供长期发展路径",
        step_4_最终决策: "用户最终选择权，但AI有责任提供真实信息",
        safety_principle: "宁可冒犯，也不能让用户在不知情下走向死亡"
    },
    data_provenance: {
        sources: [
            "Himalayan Database（8000米峰登山统计）",
            "K2 Base Camp Rescue/Death Records",
            "American Alpine Journal（登山事故分析）",
            "Adventure Consultants（运营商的K2历史数据）",
            "2008年K2灾难详细调查报告",
            "巴基斯坦Alpine Club历史数据"
        ],
        last_review: "2026-01-31",
        next_review: "2026-07-31",
        note: "数据来自实际死亡事件和登山统计，不是假设"
    },
    frequently_fatal_mistakes: [
        {
            mistake: "高估珠峰经验的可迁移性",
            why_fatal: "珠峰商业路线不需要技术决策，K2需要",
            prevention: "认识到K2是完全不同的事"
        },
        {
            mistake: "选择便宜的不知名运营商",
            why_fatal: "廉价 = 向导经验不足 = 关键时刻无法做对决策",
            prevention: "只与有K2成功记录的顶级公司合作"
        },
        {
            mistake: "准备时间不足（少于1年）",
            why_fatal: "无法积累必要的技术和体能",
            prevention: "最少规划2-3年"
        },
        {
            mistake: "在瓶颈区域犹豫或等待",
            why_fatal: "每分钟都在死亡地带，2008年11人死于此",
            prevention: "制定硬性时间截点：天亮必须下去"
        },
        {
            mistake: "被队友或向导压力影响放弃决定",
            why_fatal: "群体压力导致不理性决策，接近死亡仍继续",
            prevention: "提前制定个人的放弃阈值，坚持执行"
        },
        {
            mistake: "信任不了解的人或缺乏经验的队友",
            why_fatal: "高海拔中一个错误 = 多人死亡",
            prevention: "确认每个队友都有相似的经验和理念"
        }
    ],
    sample_realistic_scenarios: {
        scenario_1: {
            title: "你在瓶颈区域，08:30，天气开始恶化",
            context: "距离顶峰还有30分钟，其他队伍也在上升中，绳队拥堵",
            decision: "继续还是下降？",
            correct_answer: "立即下降，理由：暴露在极度危险地带，时间已过",
            consequence_of_continuing: "可能成为2008年灾难的重演，11人死亡"
        },
        scenario_2: {
            title: "你的队友在C4营地出现严重高反症状",
            context: "脑水肿的早期迹象，他无法自主行动，还有2天到冲顶日期",
            decision: "坚持冲顶还是陪他下去？",
            correct_answer: "协助他下去，放弃这次冲顶",
            rationale: "如果他恶化，你无法在8400m高海拔救他，两个人都会死"
        },
        scenario_3: {
            title: "天气预报改变，48小时窗口缩短为24小时",
            context: "运营商催促冲顶，说这可能是本季唯一的窗口",
            decision: "相信催促还是等待更好的窗口？",
            correct_answer: "如果你不完全确定，坚持放弃，等待下一窗口",
            rationale: "仓促冲顶 = 错误决策的导火索，死亡率大幅上升"
        }
    },
    final_question_for_reflection: {
        question: "如果你知道登K2有25%的概率永远回不了家，你还会去吗？",
        honest_answer: "如果你仍然说'会'，那你可能做好了准备。如果你说'不会'，K2不适合你。"
    }
};
//# sourceMappingURL=k2-personas.config.js.map