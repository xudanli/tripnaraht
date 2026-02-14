"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALPS_USER_PERSONAS = void 0;
exports.ALPS_USER_PERSONAS = {
    metadata: {
        version: "1.0.0",
        last_updated: "2026-01-31",
        description: "阿尔卑斯山徒步和登山者用户画像系统（分层结构版）",
        credibility_score: 0.94,
        language: "zh-CN",
        region: "Alps",
        structure_reference: "Greenland user personas hierarchical model"
    },
    overview: {
        purpose: "帮助用户快速识别自己属于哪种登山者/徒步者类型，从而判断适合哪些路线和活动",
        philosophy: "判断而非规划 - 理解自己的能力边界和山地环境危险比规划行程更重要",
        regional_context: "阿尔卑斯跨越瑞士、法国、意大利、奥地利等多国，同时具有最发达的山地基础设施（缆车、山屋、公共交通）和高度的商业化"
    },
    user_personas: [
        {
            persona_id: "alps_persona_001",
            persona_name: "首次山地访问者",
            persona_name_en: "First-Time Alpine Visitor",
            percentage_of_visitors: "50%",
            characteristics: {
                experience_level: "无或极少山地经验",
                physical_fitness: "中等（日常运动）",
                risk_tolerance: "低-中等",
                time_available: "3-7天",
                budget_eur: "1500-4000",
                motivations: [
                    "看到阿尔卑斯标志性景观（马特洪峰、勃朗峰等）",
                    "体验欧洲最高的山脉",
                    "摄影和视觉震撼",
                    "舒适度与冒险的平衡",
                    "文化和村镇体验"
                ]
            },
            recommended_routes: [
                {
                    route: "少女峰地区缆车+步行",
                    reason: "缆车直达高海拔，步行轻松安全，风景壮观",
                    difficulty_match: "完美",
                    season: "全年"
                },
                {
                    route: "伊泽尔冰川观光",
                    reason: "缆车接驳，短步行，冰川近距离体验",
                    difficulty_match: "完美",
                    season: "6月-10月"
                },
                {
                    route: "勃朗峰南针峰（缆车线路）",
                    reason: "欧洲最高点近距离眺望，玻璃观景台",
                    difficulty_match: "完美",
                    season: "5月-10月"
                },
                {
                    route: "马特洪峰地区低难度徒步",
                    reason: "5-Seenweg路线，风景美但无技术难度",
                    difficulty_match: "完美",
                    season: "6月-9月"
                }
            ],
            not_recommended: [
                "任何技术登山（需要绳索和保护装备）",
                "冰川穿越",
                "多日高难度徒步（TMB完整路线）",
                "冬季登山",
                "任何4000米高峰的登顶尝试"
            ],
            preparation_needs: [
                "舒适的登山靴（可在当地租赁或购买）",
                "分层衣物系统（阿尔卑斯天气多变）",
                "防晒霜和太阳镜（高海拔紫外线强）",
                "山地旅游保险（包括直升机救援）",
                "相机和备用电池"
            ],
            expected_experiences: {
                physical_challenge: "低",
                cultural_immersion: "中",
                natural_beauty: "极高",
                comfort_level: "中-高（酒店/山屋住宿）",
                technical_requirement: "无"
            },
            typical_itinerary: {
                day_1: "抵达因特拉肯或霞慕尼，定居点探索",
                day_2: "少女峰或Jungfraujoch缆车一日游",
                day_3: "伊泽尔冰川观光或勃朗峰地区",
                day_4: "马特洪峰地区徒步（如体力许可）",
                day_5_6: "自由活动、徒步、摄影",
                day_7: "返回"
            },
            success_factors: [
                "事先查看天气，不要强行登山",
                "穿着得当（山地天气瞬间可变）",
                "从简单路线开始建立信心",
                "跟随标记良好的小径",
                "享受缆车等基础设施带来的便利",
                "尊重高海拔和天气的影响"
            ],
            altitude_acclimatization: {
                max_comfortable_altitude: "2500m",
                max_safe_altitude_with_cable_car: "3800m",
                acclimatization_needs: "一般无需特殊适应，轻度头晕可能"
            },
            cost_breakdown: {
                accommodation_per_night: "EUR 80-150",
                meals_per_day: "EUR 40-80",
                cable_cars_activities: "EUR 100-200",
                total_weekly_estimate: "EUR 2000-3500"
            }
        },
        {
            persona_id: "alps_persona_002",
            persona_name: "登山爱好者",
            persona_name_en: "Hiking & Trekking Enthusiast",
            percentage_of_visitors: "35%",
            characteristics: {
                experience_level: "有徒步、登山或类似运动经验",
                physical_fitness: "良好（定期运动，可承受每周运动）",
                risk_tolerance: "中等",
                time_available: "1-2周",
                budget_eur: "2000-6000",
                motivations: [
                    "完成经典登山路线（TMB、Haute Route等）",
                    "挑战高海拔（3000-4000m）",
                    "深度山地体验",
                    "多日自给自足能力",
                    "学习和改进山地技能"
                ]
            },
            recommended_routes: [
                {
                    route: "环勃朗峰步道（TMB）",
                    reason: "阿尔卑斯最经典路线，7-10天，风景多变",
                    difficulty_match: "完美",
                    prerequisites: ["3-4小时每天步行能力", "山屋住宿经验"],
                    season: "6月-9月"
                },
                {
                    route: "多洛米蒂Alta Via 1",
                    reason: "8-10天，技术简单但体力耗费，山屋路线",
                    difficulty_match: "完美",
                    prerequisites: ["中等体力", "不需要技术攀登"],
                    season: "6月-9月"
                },
                {
                    route: "Walker's Haute Route（步行版）",
                    reason: "12天，高海拔（3000m），全景线路",
                    difficulty_match: "良好",
                    prerequisites: ["良好的高海拔适应", "8-10小时步行能力"],
                    season: "7月-9月"
                },
                {
                    route: "Luzern-Interlaken-Montreux路线",
                    reason: "5-7天，缆车+徒步混合，轻松但壮观",
                    difficulty_match: "完美",
                    season: "全年"
                }
            ],
            stretch_goals: [
                {
                    route: "引导下的Breithorn登顶",
                    condition: "需要向导，基本冰川知识",
                    note: "4164m，技术简单的4000m高峰"
                },
                {
                    route: "蒙特罗莎向导登山",
                    condition: "需要专业向导，冰川经验",
                    note: "需要2-3天，较强体力"
                }
            ],
            not_recommended: [
                "独立冰川穿越",
                "技术攀登（需要绳索）",
                "冬季登山",
                "马特洪峰独立攀登",
                "勃朗峰标准路线（无向导）"
            ],
            preparation_needs: [
                "B1级登山靴（脚踝支撑）",
                "分层衣物系统（包括绝缘层）",
                "防水外套和登山裤",
                "登山杖（减轻膝盖压力）",
                "40-50L背包",
                "头灯和急救工具",
                "基础地图和导航工具",
                "山地旅游保险（强制）",
                "Via Ferrata装备（如涉及）"
            ],
            expected_experiences: {
                physical_challenge: "高",
                cultural_immersion: "中-高",
                natural_beauty: "极高",
                comfort_level: "中等（山屋住宿，共享设施）",
                technical_requirement: "无（除非选择特殊路线）",
                self_reliance: "中-高"
            },
            typical_itinerary_tmb: {
                day_1: "法国霞慕尼集合，准备和适应",
                day_2_3: "北线（Chamonix-Vallorcine方向）",
                day_4_5: "瑞士段（Trient-Alp d'Huez）",
                day_6_7: "意大利段和Courmayeur",
                day_8_9: "返回Chamonix的南线"
            },
            success_factors: [
                "充分的体能训练（每周3次，每次1小时+）",
                "事先参加1-2次一日登山积累高海拔经验",
                "提前预订山屋（旺季尤其重要）",
                "携带足够的防晒和防水装备",
                "学习基础导航和天气判断",
                "在山屋认真休息而非赶时间",
                "做好心理准备应对多变天气"
            ],
            altitude_acclimatization: {
                max_comfortable_altitude: "3500m",
                acclimatization_strategy: "逐日上升，休息日很重要",
                altitude_sickness_risk: "中（3000m+出现头痛常见）",
                management: "充分补水、适当休息、必要时下降"
            },
            cost_breakdown: {
                mountain_hut_night: "EUR 50-80",
                meals_self_provided: "EUR 30-50/day",
                cable_cars_shortcuts: "EUR 200-400（可选）",
                guides_if_needed: "EUR 200-300/day",
                total_weekly_estimate: "EUR 2500-5000"
            }
        },
        {
            persona_id: "alps_persona_003",
            persona_name: "高山登山家",
            persona_name_en: "Alpine Mountaineer / Alpinist",
            percentage_of_visitors: "12%",
            characteristics: {
                experience_level: "多次4000m+登顶或技术登山经验",
                physical_fitness: "优秀（专业运动员水平）",
                risk_tolerance: "高（但计算过的风险）",
                time_available: "1-4周",
                budget_eur: "3000-15000+",
                motivations: [
                    "4000m高峰登顶（勃朗峰、马特洪峰等）",
                    "技术攀登体验",
                    "冰川和混合地形",
                    "自我超越和成就感",
                    "可能的专业指导或出版"
                ]
            },
            recommended_routes: [
                {
                    route: "向导下的勃朗峰标准路线",
                    reason: "4808m，欧洲最高，技术简单但体力大",
                    difficulty_match: "完美",
                    prerequisites: ["多次3000-4000m登山", "良好体力", "基础冰川知识"],
                    season: "6月-9月"
                },
                {
                    route: "向导下的马特洪峰",
                    reason: "4478m，技术攀登（岩石+冰），极具挑战",
                    difficulty_match: "完美",
                    prerequisites: ["岩石攀登技能（UIAA III+）", "冰川经验", "团队工作能力"],
                    season: "7月-9月"
                },
                {
                    route: "格朗帕拉迪索登顶",
                    reason: "4061m，技术简单，冰川体验",
                    difficulty_match: "完美",
                    season: "7月-9月"
                },
                {
                    route: "Haute Route（完整版）",
                    reason: "Chamonix-Zermatt，10天，全冰川线路，高技术要求",
                    difficulty_match: "完美",
                    prerequisites: ["冰川救援认证", "向导陪同", "高级导航"],
                    season: "7月-8月"
                },
                {
                    route: "北面攀登（Eiger、Grandes Jorasses）",
                    reason: "技术困难，多间距攀登，高风险",
                    difficulty_match: "完美",
                    prerequisites: ["UIAA IV级岩石攀登", "混合地形经验", "绳组管理"],
                    season: "7月-9月"
                }
            ],
            advanced_objectives: [
                {
                    route: "Eiger北面直线路（North Face Direct）",
                    technical_grade: "UIAA VI+",
                    condition: "需要专业向导或很强的自主能力"
                },
                {
                    route: "Grandes Jorasses Walker Spur",
                    technical_grade: "UIAA V-VI",
                    condition: "混合地形，高暴露，强手"
                },
                {
                    route: "冬季阿尔卑斯登山",
                    condition: "1月-3月，额外的雪崩和寒冷风险"
                }
            ],
            not_recommended: [
                "无向导的4000m登顶（除非有明确的自主能力证明）",
                "无经验的技术攀登",
                "忽视风险评估的冒险"
            ],
            required_qualifications: [
                "至少5次4000m+登顶经历",
                "冰川救援认证（IFMGA标准）",
                "岩石攀登能力（UIAA III+最低）",
                "混合地形（冰+岩石）经验",
                "高级野外医疗（WFR或WEMT）",
                "团队管理和交流能力",
                "风险评估和决策能力"
            ],
            preparation_needs: [
                "B3级山地靴（专业登山靴）",
                "完整的技术装备（冰斧、冰爪、保护装备）",
                "60m绳组",
                "攀登背包（60L+）",
                "头盔",
                "雪崩装备（信标、探针、铲）",
                "高级导航和通讯设备",
                "应急避难所和求生装备",
                "3-6个月的专项训练"
            ],
            expected_experiences: {
                physical_challenge: "极端",
                technical_challenge: "极端",
                mental_challenge: "极端",
                exposure: "极高（真实的致命风险）",
                isolation: "中等（仍有定期补给机会）",
                reward: "一生难忘的成就感"
            },
            typical_expedition_mont_blanc: {
                duration: "3-4天",
                day_1: "集合、技术检查、适应",
                day_2: "Goûter山屋（3817m）",
                day_3: "凌晨2-3点出发，登顶，返回山屋",
                day_4: "下山至出发地"
            },
            typical_expedition_haute_route: {
                duration: "10天",
                day_1_3: "Chamonix-Glacier d'Argentière段",
                day_4_6: "高冰川段（Balme-Col de la Forclaz）",
                day_7_10: "Zermatt方向，Matterhorn侧面"
            },
            success_factors: [
                "充分的技能训练（至少3-6个月专项训练）",
                "合格的向导或队伍（极其重要）",
                "详尽的准备和后勤计划",
                "保守的天气和风险评估",
                "强大的团队沟通",
                "知道何时撤退（最重要的技能）",
                "全面的保险（包括直升机救援）"
            ],
            altitude_acclimatization: {
                max_comfortable_altitude: "4500m",
                acclimatization_strategy: "快速上升策略（睡眠在3800m+的山屋）",
                altitude_sickness_risk: "中-高（4000m+出现是常态）",
                management: "可能需要处方药（Diamox），充分补水和氧气意识"
            },
            risk_reality: {
                success_rate: "85-95%（视条件和队伍）",
                incident_rate: "5-10%（滑坠、失温、高原反应）",
                fatality_rate: "0.1-0.3%（致命事故罕见但真实）",
                common_incidents: [
                    "高原反应导致下降",
                    "天气变化强制撤退",
                    "滑坠（通常由于疲劳）",
                    "失向和时间管理失误"
                ],
                note: "这是真实的高山运动，绝不是游戏"
            },
            cost_breakdown: {
                professional_guide_per_day: "EUR 200-400",
                mountain_hut_expeditions: "EUR 100-150/night",
                logistics_and_transport: "EUR 200-500",
                equipment_investment: "EUR 2000-5000",
                total_expedition_estimate: "EUR 3000-15000+"
            }
        },
        {
            persona_id: "alps_persona_004",
            persona_name: "冬季滑雪登山者",
            persona_name_en: "Ski Mountaineer / Alpine Ski Tourer",
            percentage_of_visitors: "3%（冬季专属）",
            experience_level: "中等-高等",
            season: "12月-5月",
            characteristics: {
                physical_fitness: "优秀（上升需要有氧耐力）",
                risk_tolerance: "高（雪崩是主要风险）",
                time_available: "3天-2周",
                budget_eur: "2000-8000",
                motivations: [
                    "访问夏季无法到达的地形",
                    "长距离滑雪（Haute Route on skis）",
                    "4000m高峰的滑雪下降",
                    "远离人群的粉雪体验"
                ]
            },
            recommended_routes: [
                {
                    route: "Haute Route on Skis（Chamonix-Zermatt）",
                    reason: "经典冬季多日滑雪，冰川穿越",
                    difficulty_match: "完美",
                    prerequisites: ["高级滑雪技能", "雪崩L2认证", "冰川经验"],
                    duration: "7-10天",
                    season: "3月-4月（最佳）"
                },
                {
                    route: "Mont Blanc Ski Descent",
                    reason: "4808m高峰从雪线下降",
                    difficulty_match: "良好",
                    prerequisites: ["高级滑雪", "冰川知识"],
                    season: "3月-4月"
                },
                {
                    route: "Engadin区域滑雪巡回赛",
                    reason: "多日自给自足滑雪",
                    difficulty_match: "完美",
                    prerequisites: ["中级滑雪", "雪崩L1"],
                    duration: "3-5天",
                    season: "1月-4月"
                }
            ],
            required_qualifications: [
                "高级滑雪能力（非雪道外滑雪）",
                "雪崩认证（IFAK L2最低）",
                "冰川和冰爪滑雪",
                "高级导航",
                "团队救援和急救",
                "装备维修和管理"
            ],
            preparation_needs: [
                "滑雪巡回赛完整装备（滑雪+皮肤+转向器）",
                "冬季登山靴",
                "雪崩收发信机、探针、铲",
                "冰爪、冰斧",
                "绳组和救援装备",
                "冬季保温系统（-20°C+）"
            ],
            risk_considerations: [
                "雪崩是最大风险",
                "能见度低导致迷向",
                "冷伤风险",
                "冰裂缝和坠落",
                "日照时间短"
            ],
            decision_daily: [
                "检查雪崩预报",
                "评估积雪稳定性",
                "预测天气趋势",
                "管理日照时间",
                "灵活改变计划"
            ]
        }
    ],
    persona_assessment_tool: {
        how_to_use: "回答以下问题确定你的画像和合适的路线",
        questions: [
            {
                q1: "你的登山经验如何？",
                answers: {
                    "从未登山或只在平地步行": "首次山地访问者",
                    "有1-3次登山经验（最高2000m）": "首次山地访问者",
                    "有多次登山经验（达到3000m+）": "登山爱好者",
                    "多次4000m+登顶或技术攀登": "高山登山家"
                }
            },
            {
                q2: "你的体力水平？",
                answers: {
                    "日常散步，不定期运动": "首次山地访问者",
                    "定期运动（每周3次），可连续活动4-6小时": "登山爱好者",
                    "高强度训练，可承受8小时+登山": "高山登山家"
                }
            },
            {
                q3: "你能接受的风险和不适？",
                answers: {
                    "不想承受严重风险，需要安全保障和舒适": "首次山地访问者",
                    "可以接受中等风险和不适（恶劣天气、肌肉酸痛），有向导或朋友同行": "登山爱好者",
                    "能接受高风险和极端不适（寒冷、暴露、技术难度），有能力应急": "高山登山家"
                }
            },
            {
                q4: "你的预算范围？",
                answers: {
                    "EUR 1500-3000（一周）": "首次山地访问者",
                    "EUR 2000-6000（10天-2周）": "登山爱好者",
                    "EUR 3000+（包括向导和装备）": "高山登山家"
                }
            },
            {
                q5: "你有哪些特殊技能？",
                answers: {
                    "没有特殊登山技能": "首次山地访问者",
                    "会基础导航、多日背包露营、或参加过登山课程": "登山爱好者",
                    "岩石攀登、冰川救援、冰爪使用、绳组管理": "高山登山家"
                }
            },
            {
                q6: "你的最高登山经历是？",
                answers: {
                    "低于1500m": "首次山地访问者",
                    "1500-3000m": "登山爱好者（初级）",
                    "3000-4000m": "登山爱好者（中级）",
                    "4000m+": "高山登山家"
                }
            }
        ]
    },
    cross_persona_advice: {
        upgrading_skills: {
            from_beginner_to_enthusiast: [
                "完成至少2-3次缆车+步行的混合日，建立信心",
                "参加一次2-3日的TMB简化版（需要山屋住宿）",
                "学习基础地图和导航",
                "获得WFA野外医疗急救认证",
                "积累体能训练（每周3次，每次1小时）",
                "参加一次高海拔适应登山（3000m+）"
            ],
            from_enthusiast_to_mountaineer: [
                "完成2-3次完整登山路线（TMB、Alta Via等）",
                "参加IFMGA冰川救援和混合地形课程",
                "进行向导下的4000m高峰登顶（Breithorn、Gran Paradiso等）",
                "学习岩石攀登（UIAA III+）",
                "获得高级野外医疗认证（WFR/WEMT）",
                "参加冬季登山或冰川专项培训"
            ]
        },
        common_mistakes: [
            {
                mistake: "高估自己的能力或低估阿尔卑斯的难度",
                consequence: "困在途中、失温、需要救援或放弃行程",
                prevention: "诚实评估能力，参考别人的经验，从简单路线开始"
            },
            {
                mistake: "低估天气变化的速度（阿尔卑斯天气可在20分钟内改变）",
                consequence: "被雾困、迷路、失温、雪暴中行进",
                prevention: "每小时检查天气，携带防雨装备，了解撤退路线"
            },
            {
                mistake: "忽视高度不适应",
                consequence: "高原反应、头痛、决策能力下降，最坏情况脑水肿",
                prevention: "缓慢上升，充分补水，了解症状，准备下降"
            },
            {
                mistake: "装备不足（特别是衣物和防水）",
                consequence: "失温是高山最常见的致死原因",
                prevention: "分层系统、防水外套总在身上、快干衣物"
            },
            {
                mistake: "不预订山屋或过度依赖运气",
                consequence: "无处住宿，被迫夜行，精疲力竭",
                prevention: "提前4-6周预订，有备选住宿计划"
            },
            {
                mistake: "忽视导航的重要性",
                consequence: "迷路、浪费体力、危险地形中行进",
                prevention: "学习地图、携带GPS、了解替代路线"
            }
        ]
    },
    ai_decision_logic: {
        persona_identification: {
            step_1: "通过分层问答确定用户画像",
            step_2: "交叉验证经验、体力、技能、预算",
            step_3: "匹配推荐路线并强调准备需求",
            step_4: "提供升级路径和学习建议",
            step_5: "优先强调风险和安全考虑"
        },
        safety_first_principle: "当用户画像与路线不匹配时，AI必须明确劝阻，即使用户坚持",
        key_decisions: [
            "用户是否应该自主行动或需要向导？",
            "用户是否理解该路线的风险？",
            "用户是否有足够的装备？",
            "是否有医疗和保险覆盖？",
            "是否有替代撤退路线？"
        ]
    },
    red_flags: {
        medical: [
            "严重的心脏病或心血管疾病",
            "严重的呼吸系统疾病",
            "未控制的高血压",
            "严重的关节炎或行动不便",
            "最近的手术或恢复期",
            "对高海拔极度敏感（严重高反史）"
        ],
        psychological: [
            "严重的恐高症",
            "严重的焦虑症或恐慌症",
            "心理健康危机期",
            "无法应对暴露和危险地形"
        ],
        practical: [
            "无有效护照或签证",
            "无山地旅游保险（包括直升机救援）",
            "预算明显不足(< 1500 EUR for week)",
            "固定日期依赖（天气可能导致计划变化）",
            "无法接受行程变更或天气取消"
        ],
        safety: [
            "无山地经验但选择技术路线",
            "不理解高海拔和天气的危险",
            "期望独自进行技术攀登",
            "年龄过小(< 10岁)或过大(> 75岁+ 体弱)",
            "曾在高海拔环境中失败或受伤",
            "不尊重山地规则和安全准则",
            "低估阿尔卑斯的难度（认为只是'旅游'）"
        ]
    },
    decision_matrix: {
        GO_FULLY_SUPPORTED: {
            description: "用户完全适合，鼓励前往",
            criteria: [
                "通过所有安全门槛",
                "有现实的期望",
                "准备充足（装备、保险、预算、技能）",
                "理解山地环境的风险",
                "匹配的画像和路线"
            ],
            support_level: "完整支持，优化体验"
        },
        GO_WITH_STRONG_CAUTION: {
            description: "用户可以去，但需要特别指导",
            criteria: [
                "有某些风险因素（如经验不足、技能有限）",
                "但心理准备充足",
                "愿意听从建议",
                "有向导或团队支持"
            ],
            support_level: "密集支持，严格监督，推荐向导"
        },
        GO_ALTERNATIVE_PLAN: {
            description: "用户不适合标准路线，推荐替代方案",
            examples: [
                "经验不足 → 建议缆车+步行的温和路线",
                "预算不足 → 建议缩短行程或选择更经济的住宿",
                "体力有限 → 建议降低难度或增加休息日",
                "技能不足 → 建议参加培训课程或选择非技术路线"
            ]
        },
        STRONGLY_RECONSIDER: {
            description: "用户可能不应该现在来",
            criteria: [
                "安全风险较高（医疗、技能、经验）",
                "心理准备不足",
                "有不可接受的医学禁忌症",
                "期望与现实差距太大（如认为阿尔卑斯只是'旅游'）"
            ],
            recommendation: "延期1-2年，先积累经验，或改目的地"
        },
        NOT_RECOMMENDED: {
            description: "用户不应该来阿尔卑斯进行山地活动",
            criteria: [
                "严重的医学禁忌症",
                "无法接受山地环境风险",
                "完全无法负担（包括救援保险）",
                "心理状况不稳定",
                "严重低估风险"
            ],
            recommendation: "强烈建议改目的地（如平原地区、城市旅游）或先进行基础训练"
        }
    },
    regional_advantages: {
        alps_vs_other_regions: {
            advantages: [
                "世界上最发达的山地基础设施（缆车、山屋、公共交通）",
                "多国合作的标准化服务",
                "经验丰富的向导和救援系统",
                "良好的通讯覆盖（即使在高海拔）",
                "多种路线难度选择",
                "夏季路线稳定且密集人口支持"
            ],
            challenges: [
                "拥挤的热门路线（尤其7-8月）",
                "商业化的权衡（山屋服务但收费高）",
                "天气多变（可能比预期更差）",
                "跨国边界复杂性（不同法规、通货）"
            ]
        }
    },
    data_provenance: {
        sources: [
            "SBB铁路和缆车运营商官方数据",
            "SAC（瑞士登山俱乐部）、CAF（法国登山俱乐部）会员数据",
            "IFMGA向导和登山学校培训经验",
            "直升机救援和保险公司事故数据",
            "登山社区和论坛反馈"
        ],
        credibility_notes: "基于公开的运营数据和安全统计，但用户经验因个人差异而异",
        last_review: "2026-01-31",
        next_review: "2026-07-31"
    }
};
//# sourceMappingURL=alps-personas.config.js.map