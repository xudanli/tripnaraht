"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOFOTEN_USER_PERSONAS = void 0;
exports.LOFOTEN_USER_PERSONAS = {
    metadata: {
        version: "2.0.0",
        last_updated: "2026-01-26",
        description: "罗弗敦岛屿用户画像系统 - 基于探险者类型的决策支持框架",
        credibility_score: 0.91,
        language: "zh-CN",
        data_sources: [
            "旅游数据分析",
            "访客调查",
            "本地向导反馈"
        ]
    },
    overview: {
        purpose: "帮助用户快速识别自己属于哪种罗弗敦探险者类型，从而判断适合哪些路线和季节",
        philosophy: "判断而非规划 - 理解自己的能力边界和风险容忍度比规划行程更重要",
        core_question: "你真的应该来罗弗敦吗？你的经验、体质和心理准备是否匹配？"
    },
    user_personas: [
        {
            persona_id: "lft_persona_001",
            persona_name: "首次北极访问者",
            persona_name_en: "First-Time Arctic Visitor",
            percentage_of_visitors: "55%",
            characteristics: {
                experience_level: "无或极少山地/北极经验",
                physical_fitness: "中等（日常运动）",
                risk_tolerance: "低-中等",
                time_available: "3-7天",
                budget_nok: "8000-25000",
                motivations: [
                    "看到标志性山峰和景观",
                    "体验不同寻常的旅行",
                    "摄影和视觉震撼",
                    "文化和渔村体验"
                ]
            },
            lofoten_attractions: [
                "午夜太阳（夏季）",
                "北极光（冬季）",
                "标志性Rorbu红房子",
                "容易抵达的壮观景色"
            ],
            recommended_routes: [
                {
                    route: "Reinebringen登山（指导版）",
                    reason: "最受欢迎、最安全、最壮观",
                    difficulty_match: "完美",
                    note: "跟随向导和大量游客"
                },
                {
                    route: "E10自驾游",
                    reason: "舒适安全，壮观景观，灵活时间",
                    difficulty_match: "完美"
                },
                {
                    route: "渔村访问和文化体验",
                    reason: "零风险，authentic体验，摄影机会",
                    difficulty_match: "完美"
                },
                {
                    route: "Hamnøy桥和观景点",
                    reason: "短距离，最佳摄影，无技能需求",
                    difficulty_match: "完美"
                }
            ],
            not_recommended: [
                "Ryten全线登山（太长太陡）",
                "冬季山地活动（危险冰和风）",
                "多日皮划艇远征",
                "偏远东格陵兰式探险"
            ],
            preparation_needs: [
                "基础防水衣物（可在当地租赁）",
                "舒适登山鞋（不需要技术装备）",
                "相机和多块电池",
                "北极旅游保险",
                "离线地图（maps.me）"
            ],
            expected_experiences: {
                physical_challenge: "低-中",
                cultural_immersion: "中",
                natural_beauty: "极高",
                comfort_level: "中-高（酒店或Rorbu住宿）",
                social: "高（跟随向导和其他游客）"
            },
            typical_itinerary: {
                day_1: "抵达，村庄探索（Reine或Henningsvær）",
                day_2: "E10自驾，景观停驻点，Hamnøy桥",
                day_3: "Reinebringen登山指导版",
                day_4: "文化活动（博物馆、咖啡厅、餐厅）",
                day_5_7: "灵活活动、购物、休闲",
                return: "返程"
            },
            success_factors: [
                "保持开放心态接受天气变化",
                "不要追求完美极光（可能性<50%冬季）",
                "跟随向导指示，信任他们的判断",
                "享受过程而非追求极限",
                "记录体验而非过度拍摄"
            ],
            warning_signs: [
                "如果你讨厌寒冷（冬季<-5°C）",
                "如果你需要完美天气计划",
                "如果你恐高（某些景点有陡峭边缘）",
                "如果你依赖高度个人化服务"
            ]
        },
        {
            persona_id: "lft_persona_002",
            persona_name: "山地探险爱好者",
            persona_name_en: "Mountain Adventure Enthusiast",
            percentage_of_visitors: "35%",
            characteristics: {
                experience_level: "有登山、徒步或皮划艇经验（2-5次）",
                physical_fitness: "高（定期进行高强度运动）",
                risk_tolerance: "中-高",
                time_available: "1-3周",
                budget_nok: "25000-70000",
                motivations: [
                    "挑战自我和技能",
                    "深度自然体验和荒野",
                    "远离人群的探险",
                    "山地环境的自我测试"
                ]
            },
            lofoten_attractions: [
                "技术地形（湿润花岗岩）",
                "戏剧性山峰和风景",
                "难度混合的路线",
                "冬季极限条件（冰、风、寒冷）"
            ],
            recommended_routes: [
                {
                    route: "Ryten/Kvalvika完整线路",
                    reason: "适度挑战，长距离耐力测试",
                    difficulty_match: "良好",
                    prerequisites: ["中等登山经验", "良好体能"],
                    duration: "7-8小时"
                },
                {
                    route: "Reinebringen进阶版（多峰组合）",
                    reason: "连续多座山峰，累积挑战",
                    difficulty_match: "良好",
                    prerequisites: ["基础登山技能"]
                },
                {
                    route: "夏季多日徒步远征",
                    reason: "远离人群的真正探险",
                    difficulty_match: "完美",
                    prerequisites: ["露营和自炊经验", "导航能力"],
                    note: "需向导或充分规划"
                },
                {
                    route: "冬季登山（风险认知版）",
                    reason: "极端条件下的真正测试",
                    difficulty_match: "良好",
                    prerequisites: ["冬季装备", "冰雪技能基础"],
                    risk: "中等（黑冰、风、寒冷）"
                }
            ],
            stretch_goals: [
                {
                    route: "Mannen困难线路",
                    condition: "仅限具备高级登山经验者",
                    note: "需要确切的风险评估，不推荐仓促"
                }
            ],
            not_recommended: [
                "东格陵兰级别的远征（太极端）",
                "独立冰川穿越（无培训致命风险）",
                "冬季恶劣天气登山（>15m/s风）"
            ],
            preparation_needs: [
                "高级登山装备（防水外套≥15000mm、技术靴、分层系统）",
                "皮划艇或登山技能升级课程",
                "野外应急医疗认证（WFA）",
                "体能训练（每周10+ 小时）",
                "导航和离线地图精通"
            ],
            expected_experiences: {
                physical_challenge: "高",
                cultural_immersion: "低-中",
                natural_beauty: "极高",
                comfort_level: "低（露营或基础住宿）",
                self_sufficiency: "中-高"
            },
            typical_itinerary: {
                week_1: "北部定点（Henningsvær）适应 + Reinebringen系列",
                week_2: "南部远征（Ryten、Kvalvika）",
                week_3: "多日露营探险或返回"
            },
            success_factors: [
                "诚实评估自己的技能等级",
                "不要低估极地环境危险（天气快速恶化）",
                "团队协作和信任至关重要",
                "尊重自然和向导建议",
                "准备好身体和心理上的困难"
            ],
            common_mistakes: [
                {
                    mistake: "高估自己的适应能力",
                    consequence: "失温、疲劳、需要救援",
                    prevention: "从简单路线开始，逐步升级"
                },
                {
                    mistake: "低估天气恶化速度",
                    consequence: "被困在山上、失方向、危险",
                    prevention: "监测yr.no，有保守的转身点"
                },
                {
                    mistake: "忽视装备准备",
                    consequence: "冻伤、失温、舒适度差",
                    prevention: "投资正确的装备，别省钱"
                }
            ],
            upgrade_path: {
                to_polar_expert: [
                    "完成2-3次罗弗敦高难度探险",
                    "参加极地专业培训课程",
                    "获得高级野外医疗认证（WEMT）",
                    "参加斯瓦尔巴或南极短期远征",
                    "组建可信赖的探险团队"
                ]
            }
        },
        {
            persona_id: "lft_persona_003",
            persona_name: "北极极端探险家",
            persona_name_en: "Polar Extreme Adventurer",
            percentage_of_visitors: "8%",
            characteristics: {
                experience_level: "多次北极/高海拔远征（5次以上）",
                physical_fitness: "卓越（专业运动员级别）",
                risk_tolerance: "高（可接受致命风险）",
                time_available: "3周-3个月",
                budget_nok: "80000-200000+",
                motivations: [
                    "终极北极挑战和自我超越",
                    "探索未知或极端环境",
                    "科学研究或记录片",
                    "在生死边缘的存在主义体验"
                ]
            },
            lofoten_attractions: [
                "冬季极端条件（-15°C+, >20m/s风）",
                "冰雪覆盖的技术路线",
                "无向导的独立探险",
                "救援遥远（冬季直升机不可用）"
            ],
            recommended_routes: [
                {
                    route: "冬季东格陵兰级远征",
                    reason: "世界级极端挑战",
                    difficulty_match: "完美",
                    prerequisites: [
                        "至少3次以上北极远征",
                        "冰川救援认证（AIARE）",
                        "高级野外医疗（WEMT）",
                        "北极熊防御培训",
                        "专业装备投资（100000+ NOK）"
                    ],
                    note: "需多人团队，不推荐独自进行"
                },
                {
                    route: "多周冬季露营远征",
                    reason: "极限环境下的纯探险",
                    difficulty_match: "完美",
                    team_size: "4-8人",
                    daily_activities: [
                        "早晨风险评估",
                        "8-10小时探险",
                        "营地建立和防御",
                        "轮班警戒（北极熊风险）"
                    ]
                }
            ],
            absolute_requirements: [
                "至少3次极地探险经历（不是旅游）",
                "冰川救援和雪崩救援认证",
                "高级野外医疗（WEMT或等价）",
                "北极熊防御和武器培训",
                "卫星通讯和高级导航专家",
                "远征团队领导经验",
                "冷环境医学基础知识"
            ],
            preparation_needs: [
                "专业级极地装备（-20°C+等级，投资80000+ NOK）",
                "6-12个月体能和技能训练",
                "大型远征团队组建和协调",
                "详细的后勤和应急计划",
                "多重保险（包括直升机救援）",
                "卫星电话和紧急信标"
            ],
            expected_experiences: {
                physical_challenge: "极端",
                psychological_challenge: "极端",
                isolation: "极高（数周不见人）",
                danger_level: "致命风险真实存在",
                reward: "一生最深刻的成就感"
            },
            typical_expedition: {
                duration: "20-40天",
                team_size: "4-8人",
                daily_schedule: [
                    "06:00 - 早晨风险评估会议",
                    "07:00-17:00 - 持续探险活动（10小时）",
                    "17:00-20:00 - 营地建立和维护",
                    "20:00+ - 晚餐、记录、轮班警戒"
                ],
                challenges: [
                    "北极熊遭遇（可能致命）",
                    "极端天气（风>30m/s, 温度-20°C）",
                    "装备故障在隔绝状态",
                    "心理极限和孤立感",
                    "体能耗尽",
                    "导航误差累积"
                ]
            },
            success_factors: [
                "充分准备和冗余计划（关键任务重复）",
                "团队信任和无缝沟通",
                "保守的风险评估（低估环境风险=死亡）",
                "知道何时撤退（勇气不等于蛮干）",
                "尊重自然的绝对力量"
            ],
            reality_check: {
                success_rate: "85%（完成探险）",
                incident_rate: "15%（需要应急响应或救援）",
                death_risk: "真实存在但<1%（有充分准备）",
                key: "这不是游戏，是真正的生存边缘挑战"
            },
            warning: "大多数人不应尝试这个等级。如果你在犹豫，答案就是'否'"
        },
        {
            persona_id: "lft_persona_004",
            persona_name: "摄影专家",
            persona_name_en: "Photography Specialist",
            percentage_of_visitors: "12%",
            characteristics: {
                experience_level: "摄影高级-专家",
                physical_fitness: "中-高（为了到达好位置）",
                risk_tolerance: "中-高（愿意在困难条件下拍摄）",
                time_available: "7-14天",
                budget_nok: "20000-50000",
                motivations: [
                    "捕捉标志性和独特影像",
                    "光线条件实验（极光、午夜太阳、蓝时刻）",
                    "创意视觉叙述",
                    "摄影组合提升"
                ]
            },
            lofoten_attractions: [
                "午夜太阳独特光线（5-7月）",
                "北极光高频率（11-2月）",
                "蓝时刻极长（秋春）",
                "戏剧山峰和水景对比"
            ],
            recommended_routes: [
                {
                    route: "Hamnøy和Reine基地摄影（无特定路线）",
                    reason: "最佳光线位置，多个角度，易于返回",
                    difficulty_match: "完美",
                    optimal_season: "全年（各季节不同魅力）"
                },
                {
                    route: "蓝时刻远征（秋春）",
                    reason: "金牌光线，长时间窗口",
                    difficulty_match: "良好",
                    duration: "05:30-19:00"
                },
                {
                    route: "极光追逐（冬季）",
                    reason: "高频率极光，蓝时刻双重",
                    difficulty_match: "中等",
                    prerequisites: ["三脚架和长曝光技能", "寒冷容忍"],
                    expected_success: "50-60% 有人看到好极光"
                },
                {
                    route: "午夜太阳连续拍摄（6-7月）",
                    reason: "24小时光线探索",
                    difficulty_match: "完美"
                }
            ],
            not_recommended: [
                "完全依赖摄影忽视安全",
                "在危险地形冒生命危险求完美镜头",
                "贪心不停的天气监测"
            ],
            preparation_needs: [
                "专业摄影装备（相机、镜头、三脚架）",
                "冬季备用电池（冷环境50% 耗电）",
                "电池保温器",
                "ND滤镜（长曝光）、UV和偏光滤镜",
                "防水相机包",
                "充足存储卡"
            ],
            expected_experiences: {
                creative_satisfaction: "极高",
                physical_comfort: "低（长时间站立在寒冷中）",
                natural_immersion: "中（专注摄影而非体验）",
                social_interaction: "低（多数时间独自工作）"
            },
            typical_itinerary: {
                day_1: "侦察和位置勘景",
                day_2: "日落时段等待（金光）",
                day_3: "夜间长曝光实验",
                day_4: "日出时段冲刺",
                day_5: "返回、编辑、规划"
            },
            success_factors: [
                "灵活的日程（天气决定机会）",
                "管理期望（完美条件罕见）",
                "多个备选位置（天气常改变计划）",
                "与其他摄影师交流（分享位置信息）"
            ]
        },
        {
            persona_id: "lft_persona_005",
            persona_name: "家庭旅行者",
            persona_name_en: "Family Traveler",
            percentage_of_visitors: "15%",
            characteristics: {
                composition: "2成人 + 1-3儿童",
                children_age: "5-15岁",
                experience_level: "初级-中等",
                physical_fitness: "中等（儿童限制）",
                risk_tolerance: "低（儿童安全第一）",
                time_available: "1-2周",
                budget_nok: "15000-40000",
                motivations: [
                    "独特位置的家庭结合时光",
                    "儿童与自然接触",
                    "共同的探险回忆",
                    "教育体验"
                ]
            },
            lofoten_attractions: [
                "可达且安全的步道",
                "令人惊叹的景观（激发儿童想象）",
                "村庄探索和文化",
                "独特而不过分冒险"
            ],
            recommended_routes: [
                {
                    route: "Reinebringen简易版",
                    reason: "短路线，指导版，大量其他家庭",
                    difficulty_match: "完美",
                    children_age: "6岁以上",
                    duration: "2-3小时"
                },
                {
                    route: "E10自驾和景观停驻",
                    reason: "舒适、灵活、壮观",
                    difficulty_match: "完美",
                    flexibility: "极高"
                },
                {
                    route: "村庄漫步（Reine, Henningsvær, Nusfjord）",
                    reason: "零风险，探索，独特氛围",
                    difficulty_match: "完美"
                },
                {
                    route: "海滩活动（夏季）",
                    reason: "儿童友好，摄影机会",
                    difficulty_match: "完美",
                    note: "水温冷（10-14°C），不适合游泳"
                }
            ],
            not_recommended: [
                "多日露营远征",
                "技术登山",
                "冬季活动（除基础外）",
                "长时间驾驶（>3小时无休息）"
            ],
            preparation_needs: [
                "家庭级防水衣物（儿童耐寒差）",
                "舒适登山鞋（儿童脚容易疼）",
                "充足零食和饮水",
                "防晕车药（如需）",
                "基础急救包",
                "娱乐用品（车上和营地）"
            ],
            constraints: [
                "儿童年龄和体能决定可行性",
                "注意力跨度（年轻儿童<1-2小时）",
                "天气安全（风险低于北欧天气）",
                "可达性（无技术路线）",
                "活动长度（应 >3小时，<5小时）",
                "设施需求（卫生间、餐厅、休息）"
            ],
            expected_experiences: {
                physical_challenge: "低",
                family_quality: "高",
                natural_appreciation: "中-高",
                comfort_level: "中（需要计划）",
                educational_value: "高"
            },
            typical_itinerary: {
                morning: "悠闲早餐和准备（8:00-9:00）",
                morning_activity: "主活动 - 简易登山或村庄（9:00-12:00）",
                lunch: "餐厅午餐和休息（重要恢复期）",
                afternoon: "轻量次活动或探索（13:30-15:30）",
                evening: "返回、休闲、儿童睡眠准备",
                night: "家庭用餐和放松"
            },
            success_factors: [
                "保持灵活的日程（天气变化很常见）",
                "正确的期望管理（北极不是迪斯尼乐园）",
                "每日能量恢复时间（午餐休息关键）",
                "儿童参与和投资感（让他们选择活动）",
                "质量over数量（3个完美回忆 > 10个匆忙体验）"
            ],
            common_challenges: [
                {
                    challenge: "天气变化影响计划",
                    solution: "有3-4个备选活动（室内博物馆、咖啡厅）"
                },
                {
                    challenge: "儿童疲劳和情绪",
                    solution: "保证充足睡眠、零食和水，预留灵活时间"
                },
                {
                    challenge: "预算与质量平衡",
                    solution: "Rorbu自炊 vs. 餐厅，选择1-2个关键体验"
                }
            ]
        },
        {
            persona_id: "lft_persona_006",
            persona_name: "浪漫寻梦者",
            persona_name_en: "Romantic Dreamer",
            percentage_of_visitors: "10%",
            characteristics: {
                composition: "情侣或新婚",
                age_range: "25-50",
                experience_level: "初级-中等",
                physical_fitness: "中等",
                risk_tolerance: "低-中等",
                time_available: "1-2周",
                budget_nok: "20000-50000",
                motivations: [
                    "浪漫体验和共同冒险",
                    "逃离日常生活",
                    "创建特殊回忆和二人故事",
                    "独特和隔离的设置"
                ]
            },
            lofoten_attractions: [
                "戏剧壮观景观",
                "隔离和浪漫气氛",
                "Rorbu真实性和独特性",
                "一起看极光或午夜太阳",
                "静水和山峰的诗意组合"
            ],
            recommended_seasons: {
                winter: {
                    reason: "极光、隔离感、浪漫寒冷",
                    success_rate: "50-60% 看到好极光",
                    atmosphere: "非常浪漫"
                },
                summer: {
                    reason: "午夜太阳、午夜散步、温暖晚风",
                    success_rate: "100% 体验午夜太阳",
                    but: "极高人群，少隔离感"
                }
            },
            recommended_routes: [
                {
                    route: "Reine Rorbu私人住宿 + 周边探索",
                    reason: "最浪漫设置，最佳摄影角度",
                    difficulty_match: "完美",
                    romantic_highlights: [
                        "Rorbu私人甲板日落",
                        "夜间极光观测（冬）或午夜散步（夏）",
                        "特殊晚餐在山景前"
                    ]
                },
                {
                    route: "Nusfjord UNESCO村庄沉浸",
                    reason: "最真实、最私密、最历史感",
                    difficulty_match: "完美",
                    romantic_highlights: [
                        "19世纪村庄探索",
                        "传统Rorbu住宿",
                        "远离现代世界"
                    ]
                },
                {
                    route: "情侣二人登山 + 景观午餐",
                    reason: "共享冒险，私密顶峰体验",
                    difficulty_match: "良好",
                    recommendation: "Reinebringen或较短路线"
                }
            ],
            absolutely_avoid: [
                "过度拥挤的Reine高峰季（6-7月中午）",
                "希望每晚完美极光（概率不到50%）",
                "比团队重视行程"
            ],
            preparation_needs: [
                "中等级防水衣物",
                "舒适登山鞋",
                "相机和三脚架（自拍和景观）",
                "浪漫晚餐计划",
                "预先预订Rorbu（提前3-6个月）"
            ],
            expected_experiences: {
                romance_index: "极高（如计划正确）",
                physical_challenge: "低-中",
                isolation: "高（尤其冬季和肩季）",
                photography_opportunity: "极高",
                shared_achievement: "高"
            },
            ideal_itinerary: {
                day_1: "到达，Rorbu定居，村庄散步",
                day_2: "E10自驾，景观停驻，晚餐预订餐厅",
                day_3: "情侣登山，顶峰野餐，日落摄影",
                day_4: "蓝时刻摄影（秋/春）或极光等待（冬）",
                day_5_7: "灵活和放松，多个Rorbu位置尝试"
            },
            success_factors: [
                "正确季节选择（冬=隔离+极光, 肩季=人少光好）",
                "预期管理（完美天气+极光不是保证）",
                "灵活日程（天气改变计划）",
                "专注彼此而非Instagram（质量over展示）",
                "二人协调（确保两个人都想要同样体验）"
            ]
        }
    ],
    persona_assessment_tool: {
        how_to_use: "回答以下问题确定你的最佳画像匹配",
        questions: [
            {
                q1: "你有多少次高海拔或北极地区经验？",
                answers: {
                    "0-1次": "首次访问者",
                    "2-4次": "探险爱好者",
                    "5次以上": "极端探险家"
                }
            },
            {
                q2: "你的体能水平？",
                answers: {
                    "日常散步/瑜伽": "首次访问者/家庭",
                    "定期健身/登山": "探险爱好者/摄影师",
                    "专业运动员/极限运动": "极端探险家"
                }
            },
            {
                q3: "你能接受的最大风险？",
                answers: {
                    "零风险，完全安全": "首次访问者/家庭",
                    "中等风险，有专业支持": "探险爱好者/摄影师",
                    "高风险，包括致命可能": "极端探险家"
                }
            },
            {
                q4: "你的预算范围（NOK）？",
                answers: {
                    "8000-20000": "首次访问者/家庭",
                    "20000-50000": "摄影师/探险爱好者/浪漫寻梦者",
                    "50000+": "极端探险家"
                }
            },
            {
                q5: "最吸引你的是什么？",
                answers: {
                    "安全、壮观、舒适": "首次访问者",
                    "家庭质量和儿童体验": "家庭旅行者",
                    "摄影和光线": "摄影专家",
                    "浪漫和二人回忆": "浪漫寻梦者",
                    "个人挑战和极限": "探险爱好者或极端探险家"
                }
            }
        ],
        assessment_process: [
            "第1步: 完成自评问卷",
            "第2步: 匹配最高频率的画像",
            "第3步: 阅读推荐路线和准备需求",
            "第4步: 诚实评估是否准备就绪",
            "第5步: 如不确定，咨询专业向导"
        ]
    },
    cross_persona_advice: {
        skill_upgrade_paths: {
            from_first_time_to_enthusiast: [
                "完成至少1次罗弗敦高难度登山",
                "参加皮划艇或高级登山培训课程",
                "获得WFA野外医疗急救认证",
                "积累体能训练（每周10+ 小时）",
                "经历1次冬季山地条件"
            ],
            from_enthusiast_to_extreme: [
                "完成2-3次罗弗敦或北极困难远征",
                "参加极地专业培训（冰川、北极熊、雪崩）",
                "获得高级野外医疗认证（WEMT）",
                "完成斯瓦尔巴或南极探险",
                "组建和领导多次远征团队"
            ]
        },
        common_mistakes: [
            {
                mistake: "高估自己的适应能力",
                consequence: "失温、疲劳、惊恐、需要救援",
                prevention: "从下一个等级路线开始，不要跳跃"
            },
            {
                mistake: "低估罗弗敦环境危险性",
                consequence: "湿滑花岗岩、黑冰、风速快速变化导致迷失或伤害",
                prevention: "充分研究、尊重警告、有转身计划"
            },
            {
                mistake: "忽视心理和团队准备",
                consequence: "恐慌、决策差、团队冲突、失败",
                prevention: "心理韧性训练、清晰沟通协议、队伍信任构建"
            },
            {
                mistake: "装备省钱",
                consequence: "冻伤、失温、舒适度差、风险增加",
                prevention: "投资正确装备，租赁也可接受"
            }
        ]
    },
    ai_decision_logic: {
        persona_identification: {
            step1: "通过自评问卷确定用户画像",
            step2: "匹配推荐路线和季节",
            step3: "明确强调准备需求和风险",
            step4: "提供升级路径（如适用）",
            step5: "在画像不匹配时明确劝阻"
        },
        safety_first_principle: [
            "当用户画像与路线不匹配时，AI必须明确劝阻而非鼓励",
            "当风险超过用户容忍度时，建议替代方案",
            "当装备或准备不足时，推迟或升级要求",
            "诚实但尊重地挑战虚高的自评"
        ],
        judgment_not_planning: "帮助用户判断他们是否应该来，而非盲目规划最佳行程"
    },
    data_provenance: {
        sources: [
            "罗弗敦旅游统计数据",
            "本地登山向导访谈",
            "探险公司客户档案",
            "搜救事故分析",
            "极地探险协会研究"
        ],
        last_review: "2026-01-26",
        next_review: "2026-07-26"
    }
};
//# sourceMappingURL=lofoten-personas.config.js.map