"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const feasibilityMatrixDoc = {
    metadata: {
        version: "1.0.0",
        last_updated: "2026-01-23",
        data_sources: [
            "TripNARA产品理论",
            "路线数据综合分析",
            "风险评估系统",
            "用户画像系统"
        ],
        credibility_score: 0.91,
        language: "zh-CN",
        framework: "TripNARA路线可行性评分矩阵"
    },
    framework_overview: {
        description: "TripNARA路线可行性评分系统",
        purpose: "帮助AI判断'这条路线对这个用户是否可行'",
        core_concept: "可行性 ≠ 推荐度，而是'能否成功完成'的概率",
        score_range: "0.0 - 1.0（越高越可行）",
        decision_threshold: {
            high_feasibility: "> 0.75（推荐）",
            medium_feasibility: "0.5 - 0.75（谨慎推荐，需说明风险）",
            low_feasibility: "0.25 - 0.5（不推荐，除非用户坚持）",
            very_low_feasibility: "< 0.25（强烈不推荐）"
        }
    },
    evaluation_dimensions: [
        {
            dimension_id: "dim_001",
            name: "时间可行性",
            name_en: "Time Feasibility",
            weight: 0.25,
            description: "用户是否有足够时间完成路线",
            formula: "1 - abs(user_days - route_recommended_days) / route_recommended_days",
            examples: [
                {
                    scenario: "用户3天，路线推荐3天",
                    score: 1.0,
                    explanation: "时间完美匹配"
                },
                {
                    scenario: "用户2天，路线推荐3天",
                    score: 0.67,
                    explanation: "时间紧张但可行"
                },
                {
                    scenario: "用户1天，路线推荐3天",
                    score: 0.33,
                    explanation: "时间严重不足"
                }
            ]
        },
        {
            dimension_id: "dim_002",
            name: "季节可行性",
            name_en: "Seasonal Feasibility",
            weight: 0.20,
            description: "当前季节是否适合该路线",
            scoring_rules: {
                best_season: 1.0,
                good_season: 0.8,
                possible_season: 0.5,
                challenging_season: 0.3,
                impossible_season: 0.0
            },
            examples: [
                {
                    route: "黄金圈",
                    season: "夏季",
                    score: 1.0,
                    explanation: "全年可行，夏季最佳"
                },
                {
                    route: "西峡湾",
                    season: "冬季",
                    score: 0.0,
                    explanation: "冬季道路关闭，不可行"
                },
                {
                    route: "内陆高地F路",
                    season: "5月",
                    score: 0.0,
                    explanation: "F路未开放"
                }
            ]
        },
        {
            dimension_id: "dim_003",
            name: "经验匹配度",
            name_en: "Experience Match",
            weight: 0.20,
            description: "用户经验是否匹配路线难度",
            formula: "1 - abs(user_experience_level - route_difficulty_level)",
            scoring_rules: {
                beginner_easy_route: 1.0,
                beginner_moderate_route: 0.6,
                beginner_challenging_route: 0.2,
                advanced_easy_route: 0.8,
                advanced_challenging_route: 1.0
            },
            examples: [
                {
                    user: "首次访问者",
                    route: "黄金圈（简单）",
                    score: 1.0,
                    explanation: "完美匹配"
                },
                {
                    user: "首次访问者",
                    route: "西峡湾（挑战）",
                    score: 0.2,
                    explanation: "经验不足"
                },
                {
                    user: "经验丰富者",
                    route: "内陆高地（极端）",
                    score: 1.0,
                    explanation: "经验充足"
                }
            ]
        },
        {
            dimension_id: "dim_004",
            name: "装备可行性",
            name_en: "Equipment Feasibility",
            weight: 0.15,
            description: "用户是否有必需装备",
            required_equipment_check: [
                {
                    equipment: "普通轿车",
                    suitable_routes: ["黄金圈", "环岛南线", "斯奈山"],
                    unsuitable_routes: ["西峡湾（推荐四驱）", "F路（必须四驱）"]
                },
                {
                    equipment: "四驱车",
                    suitable_routes: ["所有路线"],
                    critical_for: ["F路", "冬季驾驶"]
                },
                {
                    equipment: "冬季轮胎",
                    critical_for_season: "11月至4月",
                    legal_requirement: true
                }
            ],
            scoring: {
                has_all_required: 1.0,
                has_recommended_not_required: 0.8,
                missing_recommended: 0.6,
                missing_required: 0.0
            }
        },
        {
            dimension_id: "dim_005",
            name: "预算可行性",
            name_en: "Budget Feasibility",
            weight: 0.10,
            description: "用户预算是否支持路线成本",
            formula: "min(1.0, user_budget / route_estimated_cost)",
            scoring: {
                budget_exceeds_cost: 1.0,
                budget_matches_cost: 0.9,
                budget_80_percent_of_cost: 0.7,
                budget_60_percent_of_cost: 0.4,
                budget_below_50_percent_of_cost: 0.1
            },
            cost_reduction_strategies: [
                "露营代替酒店",
                "自己做饭",
                "青旅宿舍",
                "淡季旅行",
                "免费景点优先"
            ]
        },
        {
            dimension_id: "dim_006",
            name: "风险容忍度匹配",
            name_en: "Risk Tolerance Match",
            weight: 0.10,
            description: "用户风险容忍度是否匹配路线风险",
            formula: "1 - max(0, route_risk_score - user_risk_tolerance)",
            examples: [
                {
                    user_risk_tolerance: 0.3,
                    route_risk: 0.15,
                    score: 1.0,
                    explanation: "路线风险低于用户承受能力"
                },
                {
                    user_risk_tolerance: 0.3,
                    route_risk: 0.6,
                    score: 0.7,
                    explanation: "路线风险超出用户承受能力"
                }
            ]
        }
    ],
    feasibility_calculation: {
        formula: "weighted_sum(dimension_scores × dimension_weights)",
        example: {
            user: "首次访问者，夏季3天，普通车，预算$800",
            route: "环岛南线（2-3天）",
            calculations: {
                time_feasibility: { score: 0.9, weight: 0.25, weighted: 0.225 },
                seasonal_feasibility: { score: 1.0, weight: 0.20, weighted: 0.20 },
                experience_match: { score: 0.9, weight: 0.20, weighted: 0.18 },
                equipment_feasibility: { score: 1.0, weight: 0.15, weighted: 0.15 },
                budget_feasibility: { score: 0.85, weight: 0.10, weighted: 0.085 },
                risk_tolerance_match: { score: 0.9, weight: 0.10, weighted: 0.09 }
            },
            total_feasibility_score: 0.93,
            interpretation: "高度可行，强烈推荐"
        }
    },
    route_feasibility_matrix: {
        description: "各路线在不同用户状态下的可行性",
        routes: [
            {
                route_id: "golden_circle",
                route_name: "黄金圈",
                baseline_feasibility: 0.9,
                feasibility_by_persona: {
                    "首次探索者": 0.95,
                    "摄影追光者": 0.70,
                    "冒险挑战者": 0.60,
                    "家庭亲子游": 0.95,
                    "预算背包客": 0.90,
                    "文化深度游": 0.75,
                    "轻奢度假者": 0.85
                },
                feasibility_by_season: {
                    summer: 1.0,
                    winter: 0.85,
                    shoulder: 0.95
                },
                minimum_requirements: {
                    days: 1,
                    vehicle: "普通车",
                    experience: "beginner",
                    budget_usd: 130
                },
                key_constraints: ["无"],
                recommendation: "几乎所有用户都可行"
            },
            {
                route_id: "ring_road_south",
                route_name: "环岛南线",
                baseline_feasibility: 0.85,
                feasibility_by_persona: {
                    "首次探索者": 0.90,
                    "摄影追光者": 0.95,
                    "冒险挑战者": 0.75,
                    "家庭亲子游": 0.85,
                    "预算背包客": 0.90,
                    "文化深度游": 0.70,
                    "轻奢度假者": 0.85
                },
                feasibility_by_season: {
                    summer: 0.95,
                    winter: 0.70,
                    shoulder: 0.90
                },
                minimum_requirements: {
                    days: 2,
                    vehicle: "普通车",
                    experience: "beginner",
                    budget_usd: 340
                },
                key_constraints: [
                    "需至少2天",
                    "冬季需谨慎驾驶"
                ],
                recommendation: "多数用户可行"
            },
            {
                route_id: "snaefellsnes",
                route_name: "斯奈山半岛",
                baseline_feasibility: 0.85,
                feasibility_by_persona: {
                    "首次探索者": 0.85,
                    "摄影追光者": 0.90,
                    "冒险挑战者": 0.70,
                    "家庭亲子游": 0.80,
                    "预算背包客": 0.85,
                    "文化深度游": 0.75,
                    "轻奢度假者": 0.85
                },
                feasibility_by_season: {
                    summer: 0.95,
                    winter: 0.70,
                    shoulder: 0.85
                },
                minimum_requirements: {
                    days: 1,
                    vehicle: "普通车",
                    experience: "beginner",
                    budget_usd: 140
                },
                key_constraints: [
                    "冬季道路条件差"
                ],
                recommendation: "多数用户可行"
            },
            {
                route_id: "ring_road_full",
                route_name: "完整环岛",
                baseline_feasibility: 0.65,
                feasibility_by_persona: {
                    "首次探索者": 0.75,
                    "摄影追光者": 0.85,
                    "冒险挑战者": 0.85,
                    "家庭亲子游": 0.60,
                    "预算背包客": 0.70,
                    "文化深度游": 0.85,
                    "轻奢度假者": 0.80
                },
                feasibility_by_season: {
                    summer: 0.90,
                    winter: 0.40,
                    shoulder: 0.75
                },
                minimum_requirements: {
                    days: 7,
                    vehicle: "普通车（夏季）/四驱（冬季）",
                    experience: "beginner",
                    budget_usd: 1370
                },
                key_constraints: [
                    "需至少7天（推荐10天）",
                    "预算较高",
                    "冬季需经验和四驱"
                ],
                recommendation: "需充足时间和预算"
            },
            {
                route_id: "westfjords",
                route_name: "西峡湾",
                baseline_feasibility: 0.50,
                feasibility_by_persona: {
                    "首次探索者": 0.25,
                    "摄影追光者": 0.70,
                    "冒险挑战者": 0.90,
                    "家庭亲子游": 0.30,
                    "预算背包客": 0.60,
                    "文化深度游": 0.75,
                    "轻奢度假者": 0.40
                },
                feasibility_by_season: {
                    summer: 0.80,
                    winter: 0.0,
                    shoulder: 0.50
                },
                minimum_requirements: {
                    days: 5,
                    vehicle: "四驱推荐",
                    experience: "intermediate",
                    budget_usd: 900
                },
                key_constraints: [
                    "仅夏季可行",
                    "需中级以上经验",
                    "需5天以上时间",
                    "服务极少"
                ],
                recommendation: "仅适合二次访问和冒险者"
            },
            {
                route_id: "highlands_f_roads",
                route_name: "内陆高地F路",
                baseline_feasibility: 0.30,
                feasibility_by_persona: {
                    "首次探索者": 0.05,
                    "摄影追光者": 0.50,
                    "冒险挑战者": 0.95,
                    "家庭亲子游": 0.05,
                    "预算背包客": 0.40,
                    "文化深度游": 0.20,
                    "轻奢度假者": 0.30
                },
                feasibility_by_season: {
                    summer: 0.70,
                    winter: 0.0,
                    shoulder: 0.10
                },
                minimum_requirements: {
                    days: 3,
                    vehicle: "四驱（必须）",
                    experience: "advanced",
                    budget_usd: 800
                },
                key_constraints: [
                    "仅6-9月开放",
                    "必须四驱车",
                    "需高级驾驶经验",
                    "河流穿越技能",
                    "需PLB定位信标"
                ],
                recommendation: "仅适合经验丰富的冒险者"
            }
        ]
    },
    real_world_scenarios: [
        {
            scenario_id: "scenario_001",
            user_profile: {
                persona: "首次探索者",
                days_available: 3,
                season: "夏季",
                vehicle: "普通轿车",
                budget_usd: 800,
                experience: "beginner",
                risk_tolerance: 0.2
            },
            route_feasibility_scores: {
                "黄金圈（1天）": {
                    score: 0.95,
                    recommendation: "强烈推荐",
                    reasoning: "完美匹配，时间充裕，成本低，零风险"
                },
                "环岛南线（2-3天）": {
                    score: 0.92,
                    recommendation: "强烈推荐",
                    reasoning: "时间完美，预算充足，经典路线"
                },
                "斯奈山半岛（1-2天）": {
                    score: 0.88,
                    recommendation: "推荐",
                    reasoning: "时间充裕，可行性高"
                },
                "完整环岛（7-10天）": {
                    score: 0.35,
                    recommendation: "不推荐",
                    reasoning: "时间严重不足（仅3天）"
                },
                "西峡湾（5天）": {
                    score: 0.20,
                    recommendation: "强烈不推荐",
                    reasoning: "时间不足，经验不足，首次不适合"
                }
            },
            final_recommendation: "环岛南线2-3天"
        },
        {
            scenario_id: "scenario_002",
            user_profile: {
                persona: "冒险挑战者",
                days_available: 7,
                season: "夏季7月",
                vehicle: "四驱SUV",
                budget_usd: 2000,
                experience: "advanced",
                risk_tolerance: 0.8
            },
            route_feasibility_scores: {
                "黄金圈（1天）": {
                    score: 0.60,
                    recommendation: "不推荐",
                    reasoning: "太简单，不符合冒险偏好"
                },
                "西峡湾（5天）": {
                    score: 0.90,
                    recommendation: "推荐",
                    reasoning: "时间充足，经验匹配，装备齐全"
                },
                "内陆高地F路（3-5天）": {
                    score: 0.95,
                    recommendation: "强烈推荐",
                    reasoning: "完美匹配冒险者，F路开放，装备齐全"
                },
                "完整环岛（7天）": {
                    score: 0.70,
                    recommendation: "可行但不符合偏好",
                    reasoning: "可行但太普通，不够冒险"
                }
            },
            final_recommendation: "内陆高地F路 + 西峡湾组合"
        },
        {
            scenario_id: "scenario_003",
            user_profile: {
                persona: "家庭亲子游",
                days_available: 5,
                season: "夏季8月",
                vehicle: "普通SUV",
                budget_usd: 1500,
                experience: "beginner",
                risk_tolerance: 0.1,
                special_needs: "带2个孩子（5岁、8岁）"
            },
            route_feasibility_scores: {
                "黄金圈（1天）": {
                    score: 0.95,
                    recommendation: "强烈推荐",
                    reasoning: "安全、轻松、适合儿童"
                },
                "环岛南线（3天慢节奏）": {
                    score: 0.88,
                    recommendation: "推荐",
                    reasoning: "时间充足，可慢节奏，景点适合儿童"
                },
                "斯奈山半岛（2天）": {
                    score: 0.85,
                    recommendation: "推荐",
                    reasoning: "多样风光，不太累"
                },
                "完整环岛（7天+）": {
                    score: 0.45,
                    recommendation: "不推荐",
                    reasoning: "5天环岛太赶，孩子会疲劳"
                },
                "西峡湾（5天）": {
                    score: 0.25,
                    recommendation: "强烈不推荐",
                    reasoning: "砂石路颠簸，服务少，不适合儿童"
                }
            },
            final_recommendation: "黄金圈（1天）+ 环岛南线（3天慢节奏）+ 1天休息/雷克雅未克"
        }
    ],
    ai_decision_logic: {
        step_1: "计算用户在8个维度的状态向量",
        step_2: "匹配最接近的persona（可多个）",
        step_3: "遍历所有可用路线，计算可行性评分",
        step_4: "过滤出可行性 > 0.5 的路线",
        step_5: "按可行性和用户偏好排序",
        step_6: "生成推荐理由和风险提示",
        critical_rules: [
            "可行性 < 0.25 → 强烈不推荐，AI应主动劝阻",
            "0.25 < 可行性 < 0.5 → 不推荐，但可说明原因和改进方案",
            "0.5 < 可行性 < 0.75 → 谨慎推荐，详细说明风险",
            "可行性 > 0.75 → 推荐",
            "可行性 > 0.9 → 强烈推荐"
        ]
    },
    transparency_principle: {
        description: "TripNARA可解释性原则",
        requirements: [
            "AI必须告知用户可行性评分",
            "AI必须解释为什么可行/不可行",
            "AI必须列出关键风险因素",
            "AI必须提供改进建议（如何提高可行性）",
            "AI不能隐瞒不利信息"
        ],
        example_explanation: {
            route: "西峡湾",
            user: "首次探索者，3天",
            feasibility_score: 0.20,
            ai_response: "西峡湾对您当前状态的可行性评分为0.20（低），不推荐。原因：\n1. 时间不足：西峡湾需要至少5天，您只有3天\n2. 经验不足：作为首次访问者，西峡湾的偏远和砂石路可能过于挑战\n3. 季节：如果是冬季，西峡湾完全不可行\n\n建议：\n- 如果是首次访问，推荐环岛南线（2-3天）\n- 如果一定要去西峡湾，至少需要5天和一些冰岛驾驶经验\n- 可以下次再来西峡湾"
        }
    },
    data_provenance: {
        primary_sources: [
            {
                source: "TripNARA产品理论",
                note: "可行性评分框架",
                reliability: "very_high"
            },
            {
                source: "路线数据综合分析",
                note: "基于所有路线JSON数据",
                reliability: "very_high"
            },
            {
                source: "风险评估系统",
                note: "weather-risks.json + terrain-risks.json",
                reliability: "very_high"
            },
            {
                source: "用户画像系统",
                note: "user-personas.json",
                reliability: "high"
            }
        ],
        last_review_date: "2026-01-23",
        next_review_date: "2026-07-23"
    }
};
function jsonToText(obj, indent = 0) {
    const prefix = '  '.repeat(indent);
    let text = '';
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            text += `${prefix}${index + 1}. `;
            if (typeof item === 'object' && item !== null) {
                text += jsonToText(item, indent + 1);
            }
            else {
                text += `${item}\n`;
            }
        });
    }
    else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
            const keyName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                text += `${prefix}${keyName}:\n`;
                text += jsonToText(value, indent + 1);
            }
            else if (Array.isArray(value)) {
                text += `${prefix}${keyName}:\n`;
                text += jsonToText(value, indent + 1);
            }
            else {
                text += `${prefix}${keyName}: ${value}\n`;
            }
        }
    }
    else {
        text += `${obj}\n`;
    }
    return text;
}
async function addToRAG() {
    try {
        console.log('📚 开始将路线可行性评分矩阵添加到 RAG 系统...');
        const content = jsonToText(feasibilityMatrixDoc);
        const document = {
            collection: 'travel_guides',
            title: 'TripNARA路线可行性评分矩阵',
            content: content,
            source: 'TripNARA产品理论',
            countryCode: 'IS',
            tags: ['feasibility', 'route-scoring', 'ai-decision', 'user-matching', 'iceland'],
            metadata: {
                version: feasibilityMatrixDoc.metadata.version,
                last_updated: feasibilityMatrixDoc.metadata.last_updated,
                credibility_score: feasibilityMatrixDoc.metadata.credibility_score,
                framework: feasibilityMatrixDoc.metadata.framework,
                data_sources: feasibilityMatrixDoc.metadata.data_sources
            }
        };
        console.log('📤 发送文档到 RAG API...');
        const response = await axios_1.default.post(`${API_BASE_URL}/api/rag/index`, document);
        if (response.data.success) {
            console.log('✅ 文档已成功添加到 RAG 系统');
            console.log(`📋 文档 ID: ${response.data.id}`);
            console.log(`📊 标题: ${document.title}`);
            console.log(`🏷️  标签: ${document.tags.join(', ')}`);
            console.log(`📏 内容长度: ${content.length} 字符`);
        }
        else {
            console.error('❌ 添加失败:', response.data);
        }
    }
    catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.response) {
            console.error('响应数据:', error.response.data);
        }
        process.exit(1);
    }
}
addToRAG();
//# sourceMappingURL=add-feasibility-matrix-to-rag.js.map