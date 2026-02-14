export declare const K2_USER_PERSONAS: {
    metadata: {
        version: string;
        last_updated: string;
        description: string;
        credibility_score: number;
        language: string;
        risk_level: string;
        knowledge_base_type: string;
    };
    overview: {
        purpose: string;
        philosophy: string;
        core_warning: string;
    };
    user_personas: ({
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_climbers: string;
        characteristics: {
            experience_level: string;
            technical_climbing: string;
            high_altitude_time: string;
            risk_tolerance: string;
            time_available: string;
            budget_usd: string;
            motivations: string[];
        };
        danger_assessment: {
            death_probability: string;
            critical_factor: string;
            realistic_chances: {
                summit_probability: string;
                death_or_serious_injury: string;
                forced_descent: string;
                no_attempt?: undefined;
            };
            critical_realization?: undefined;
            brutal_truth?: undefined;
            why_high?: undefined;
        };
        recommended_prerequisites: {
            requirement: string;
            reason: string;
        }[];
        recommended_routes: {
            route: string;
            reason: string;
            difficulty_match: string;
            critical_sections: string[];
            warning: string;
        }[];
        not_recommended_critical: string[];
        honest_assessment: {
            your_skill_vs_k2: string;
            reason: string;
            comparison: string;
        };
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            technical_demand: string;
            risk_reality: string;
            comfort_level: string;
            isolation_duration: string;
        };
        typical_timeline: {
            month_1: string;
            month_2: string;
            month_3: string;
        };
        success_factors: string[];
        failure_scenarios: {
            scenario: string;
            probability: string;
            consequence: string;
        }[];
        honest_advice: string;
        stretch_attempts?: undefined;
        not_recommended?: undefined;
        typical_expedition?: undefined;
        critical_decision_points?: undefined;
        realistic_outcomes?: undefined;
        transition_to_mastery?: undefined;
        absolute_contraindications?: undefined;
        why_not_recommended?: undefined;
        honest_paths_forward?: undefined;
        what_you_need_to_understand?: undefined;
        realistic_outcome_if_you_insist?: undefined;
        better_alternatives?: undefined;
    } | {
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_climbers: string;
        characteristics: {
            experience_level: string;
            technical_climbing: string;
            high_altitude_time: string;
            risk_tolerance: string;
            time_available: string;
            budget_usd: string;
            motivations: string[];
        };
        danger_assessment: {
            death_probability: string;
            critical_realization: string;
            realistic_chances: {
                summit_probability: string;
                death_or_serious_injury: string;
                no_attempt: string;
                forced_descent?: undefined;
            };
            critical_factor?: undefined;
            brutal_truth?: undefined;
            why_high?: undefined;
        };
        recommended_prerequisites: {
            requirement: string;
            reason: string;
        }[];
        recommended_routes: {
            route: string;
            reason: string;
            difficulty_match: string;
            critical_sections: string[];
            team_recommendation: string;
        }[];
        stretch_attempts: {
            route: string;
            condition: string;
            note: string;
        }[];
        not_recommended: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            technical_demand: string;
            risk_reality: string;
            comfort_level: string;
            isolation_duration: string;
        };
        typical_expedition: {
            pre_expedition: string;
            month_1: string;
            month_2: string;
            month_3: string;
        };
        success_factors: string[];
        critical_decision_points: {
            point: string;
            decision: string;
            reason: string;
        }[];
        realistic_outcomes: ({
            outcome: string;
            probability: string;
            reward: string;
            experience?: undefined;
            consequence?: undefined;
            note?: undefined;
        } | {
            outcome: string;
            probability: string;
            experience: string;
            reward?: undefined;
            consequence?: undefined;
            note?: undefined;
        } | {
            outcome: string;
            probability: string;
            consequence: string;
            reward?: undefined;
            experience?: undefined;
            note?: undefined;
        } | {
            outcome: string;
            probability: string;
            note: string;
            reward?: undefined;
            experience?: undefined;
            consequence?: undefined;
        })[];
        transition_to_mastery: string[];
        not_recommended_critical?: undefined;
        honest_assessment?: undefined;
        typical_timeline?: undefined;
        failure_scenarios?: undefined;
        honest_advice?: undefined;
        absolute_contraindications?: undefined;
        why_not_recommended?: undefined;
        honest_paths_forward?: undefined;
        what_you_need_to_understand?: undefined;
        realistic_outcome_if_you_insist?: undefined;
        better_alternatives?: undefined;
    } | {
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_climbers: string;
        characteristics: {
            experience_level: string;
            technical_climbing: string;
            high_altitude_time: string;
            risk_tolerance: string;
            time_available: string;
            budget_usd: string;
            motivations: string[];
        };
        danger_assessment: {
            death_probability: string;
            brutal_truth: string;
            why_high: string;
            critical_factor?: undefined;
            realistic_chances?: undefined;
            critical_realization?: undefined;
        };
        absolute_contraindications: string[];
        why_not_recommended: {
            reason_1_skill_gap: string;
            reason_2_time: string;
            reason_3_mentality: string;
            reason_4_money: string;
            reason_5_team: string;
        };
        honest_paths_forward: ({
            path: string;
            description: string;
            steps?: undefined;
        } | {
            path: string;
            steps: string[];
            description?: undefined;
        })[];
        what_you_need_to_understand: {
            point_1: string;
            point_2: string;
            point_3: string;
            point_4: string;
            point_5: string;
        };
        realistic_outcome_if_you_insist: {
            best_case: string;
            likely_case: string;
            worst_case: string;
        };
        better_alternatives: {
            mountain: string;
            reason: string;
        }[];
        recommended_prerequisites?: undefined;
        recommended_routes?: undefined;
        not_recommended_critical?: undefined;
        honest_assessment?: undefined;
        preparation_needs?: undefined;
        expected_experiences?: undefined;
        typical_timeline?: undefined;
        success_factors?: undefined;
        failure_scenarios?: undefined;
        honest_advice?: undefined;
        stretch_attempts?: undefined;
        not_recommended?: undefined;
        typical_expedition?: undefined;
        critical_decision_points?: undefined;
        realistic_outcomes?: undefined;
        transition_to_mastery?: undefined;
    })[];
    persona_assessment_tool: {
        how_to_use: string;
        critical_warning: string;
        questions: ({
            q1: string;
            answers: {
                "0\u5EA7": string;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09": string;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09": string;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09": string;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09": string;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
                不确定?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
            q7?: undefined;
        } | {
            q2: string;
            answers: {
                无: string;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7": string;
                "WI3/\u51B0\u58C1\u9886\u6500": string;
                "WI4/5.6-5.7\u6DF7\u5408": string;
                "WI5+/5.8\u4EE5\u4E0A": string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
                不确定?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q1?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
            q7?: undefined;
        } | {
            q3: string;
            answers: {
                "\u4F4E\u4E8E5%": string;
                "5-10%": string;
                "10-20%": string;
                "20-25%": string;
                "25%+": string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
                不确定?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
            q7?: undefined;
        } | {
            q4: string;
            answers: {
                少于1个月: string;
                "1-3\u4E2A\u6708": string;
                "3-6\u4E2A\u6708": string;
                "6-12\u4E2A\u6708": string;
                "12+\u4E2A\u6708": string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
                不确定?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q5?: undefined;
            q6?: undefined;
            q7?: undefined;
        } | {
            q5: string;
            answers: {
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247": string;
                读过几篇文章: string;
                研究过死亡统计: string;
                熟悉所有重大事件: string;
                能分析技术难点和风险: string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
                不确定?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q6?: undefined;
            q7?: undefined;
        } | {
            q6: string;
            answers: {
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9": string;
                尝试救援: string;
                继续向峰顶: string;
                不确定: string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                可能太晚?: undefined;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q7?: undefined;
        } | {
            q7: string;
            answers: {
                不确定: string;
                可能太晚: string;
                "\u53EF\u4EE5\uFF08\u65F6\u95F4/\u6D77\u62D4\u9608\u503C\u6E05\u6670\uFF09": string;
                "0\u5EA7"?: undefined;
                "1\u5EA7\uFF08\u73E0\u5CF0\u5546\u4E1A\u7EBF\uFF09"?: undefined;
                "1\u5EA7\uFF08\u6280\u672F\u5CF0\uFF09"?: undefined;
                "2-3\u5EA7\uFF08\u542B\u6280\u672F\u5CF0\uFF09"?: undefined;
                "4\u5EA7\u4EE5\u4E0A\uFF08\u542B2+\u6280\u672F\u5CF0\uFF09"?: undefined;
                无?: undefined;
                "\u963F\u5C14\u5351\u65AFPD-AD\u7EA7"?: undefined;
                "WI3/\u51B0\u58C1\u9886\u6500"?: undefined;
                "WI4/5.6-5.7\u6DF7\u5408"?: undefined;
                "WI5+/5.8\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u4E8E5%"?: undefined;
                "5-10%"?: undefined;
                "10-20%"?: undefined;
                "20-25%"?: undefined;
                "25%+"?: undefined;
                少于1个月?: undefined;
                "1-3\u4E2A\u6708"?: undefined;
                "3-6\u4E2A\u6708"?: undefined;
                "6-12\u4E2A\u6708"?: undefined;
                "12+\u4E2A\u6708"?: undefined;
                "\u770B\u8FC7\u7535\u5F71/\u7EAA\u5F55\u7247"?: undefined;
                读过几篇文章?: undefined;
                研究过死亡统计?: undefined;
                熟悉所有重大事件?: undefined;
                能分析技术难点和风险?: undefined;
                "\u5E2E\u4ED6/\u5979\u56DE\u5230\u5B89\u5168\u5730\u65B9"?: undefined;
                尝试救援?: undefined;
                继续向峰顶?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
        })[];
    };
    cross_persona_comparison: {
        珠峰_vs_K2: {
            珠峰特点: string;
            K2特点: string;
            主要差异: string;
        };
        "5000\u4EBA\u767B\u73E0\u5CF0": string;
        "600\u4EBA\u767BK2": string;
        本季成功率: {
            珠峰: string;
            K2: string;
        };
    };
    critical_risk_factors: {
        risk_1_瓶颈区域: {
            location: string;
            danger: string;
            "2008\u5E74": string;
            mitigation: string;
        };
        risk_2_天气: {
            window: string;
            consequence: string;
            extreme: string;
        };
        risk_3_高反: {
            occurrence: string;
            consequence: string;
        };
        risk_4_技术失误: {
            cause: string;
            example: string;
        };
    };
    ai_decision_logic: {
        step_1_honest_assessment: string;
        step_2_红线识别: string;
        step_3_准备路径: string;
        step_4_最终决策: string;
        safety_principle: string;
    };
    data_provenance: {
        sources: string[];
        last_review: string;
        next_review: string;
        note: string;
    };
    frequently_fatal_mistakes: {
        mistake: string;
        why_fatal: string;
        prevention: string;
    }[];
    sample_realistic_scenarios: {
        scenario_1: {
            title: string;
            context: string;
            decision: string;
            correct_answer: string;
            consequence_of_continuing: string;
        };
        scenario_2: {
            title: string;
            context: string;
            decision: string;
            correct_answer: string;
            rationale: string;
        };
        scenario_3: {
            title: string;
            context: string;
            decision: string;
            correct_answer: string;
            rationale: string;
        };
    };
    final_question_for_reflection: {
        question: string;
        honest_answer: string;
    };
};
