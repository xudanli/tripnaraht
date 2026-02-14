export declare const GREENLAND_USER_PERSONAS: {
    metadata: {
        version: string;
        last_updated: string;
        description: string;
        credibility_score: number;
        language: string;
    };
    overview: {
        purpose: string;
        philosophy: string;
    };
    user_personas: ({
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_visitors: string;
        characteristics: {
            experience_level: string;
            physical_fitness: string;
            risk_tolerance: string;
            time_available: string;
            budget_dkk: string;
            motivations: string[];
        };
        recommended_routes: {
            route: string;
            reason: string;
            difficulty_match: string;
        }[];
        not_recommended: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            cultural_immersion: string;
            natural_beauty: string;
            comfort_level: string;
            self_reliance?: undefined;
            mental_challenge?: undefined;
            isolation?: undefined;
            danger_level?: undefined;
            reward?: undefined;
        };
        typical_itinerary: {
            day_1: string;
            day_2: string;
            day_3: string;
            day_4_5: string;
            day_6: string;
            week_1?: undefined;
            week_2?: undefined;
            week_3?: undefined;
        };
        success_factors: string[];
        stretch_goals?: undefined;
        transition_path?: undefined;
        required_qualifications?: undefined;
        typical_expedition?: undefined;
        reality_check?: undefined;
    } | {
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_visitors: string;
        characteristics: {
            experience_level: string;
            physical_fitness: string;
            risk_tolerance: string;
            time_available: string;
            budget_dkk: string;
            motivations: string[];
        };
        recommended_routes: ({
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites?: undefined;
        })[];
        stretch_goals: {
            route: string;
            condition: string;
            note: string;
        }[];
        not_recommended: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            cultural_immersion: string;
            natural_beauty: string;
            comfort_level: string;
            self_reliance: string;
            mental_challenge?: undefined;
            isolation?: undefined;
            danger_level?: undefined;
            reward?: undefined;
        };
        typical_itinerary: {
            week_1: string;
            week_2: string;
            week_3: string;
            day_1?: undefined;
            day_2?: undefined;
            day_3?: undefined;
            day_4_5?: undefined;
            day_6?: undefined;
        };
        success_factors: string[];
        transition_path: {
            to_expert: string[];
        };
        required_qualifications?: undefined;
        typical_expedition?: undefined;
        reality_check?: undefined;
    } | {
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_visitors: string;
        characteristics: {
            experience_level: string;
            physical_fitness: string;
            risk_tolerance: string;
            time_available: string;
            budget_dkk: string;
            motivations: string[];
        };
        recommended_routes: ({
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
            note?: undefined;
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            note: string;
            prerequisites?: undefined;
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites?: undefined;
            note?: undefined;
        })[];
        required_qualifications: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            mental_challenge: string;
            isolation: string;
            danger_level: string;
            reward: string;
            cultural_immersion?: undefined;
            natural_beauty?: undefined;
            comfort_level?: undefined;
            self_reliance?: undefined;
        };
        typical_expedition: {
            duration: string;
            team_size: string;
            daily_routine: string[];
            challenges_faced: string[];
        };
        success_factors: string[];
        reality_check: {
            success_rate: string;
            incident_rate: string;
            fatality_risk: string;
            note: string;
        };
        not_recommended?: undefined;
        typical_itinerary?: undefined;
        stretch_goals?: undefined;
        transition_path?: undefined;
    })[];
    persona_assessment_tool: {
        how_to_use: string;
        questions: ({
            q1: string;
            answers: {
                "0-1\u6B21": string;
                "2-4\u6B21": string;
                "5\u6B21\u4EE5\u4E0A": string;
                日常散步?: undefined;
                "\u5B9A\u671F\u5065\u8EAB/\u8FD0\u52A8"?: undefined;
                专业运动员级别?: undefined;
                "\u4F4E\u98CE\u9669\uFF0C\u6709\u5B89\u5168\u4FDD\u969C"?: undefined;
                "\u4E2D\u7B49\u98CE\u9669\uFF0C\u6709\u4E13\u4E1A\u5411\u5BFC"?: undefined;
                "\u9AD8\u98CE\u9669\uFF0C\u5305\u62EC\u81F4\u547D\u53EF\u80FD"?: undefined;
                "10000-30000"?: undefined;
                "30000-80000"?: undefined;
                "100000+"?: undefined;
                无特殊技能?: undefined;
                "\u76AE\u5212\u8247/\u767B\u5C71/\u91CE\u5916\u751F\u5B58"?: undefined;
                "\u51B0\u5DDD\u6551\u63F4/\u533B\u7597\u6025\u6551/\u5317\u6781\u718A\u9632\u5FA1"?: undefined;
            };
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
        } | {
            q2: string;
            answers: {
                日常散步: string;
                "\u5B9A\u671F\u5065\u8EAB/\u8FD0\u52A8": string;
                专业运动员级别: string;
                "0-1\u6B21"?: undefined;
                "2-4\u6B21"?: undefined;
                "5\u6B21\u4EE5\u4E0A"?: undefined;
                "\u4F4E\u98CE\u9669\uFF0C\u6709\u5B89\u5168\u4FDD\u969C"?: undefined;
                "\u4E2D\u7B49\u98CE\u9669\uFF0C\u6709\u4E13\u4E1A\u5411\u5BFC"?: undefined;
                "\u9AD8\u98CE\u9669\uFF0C\u5305\u62EC\u81F4\u547D\u53EF\u80FD"?: undefined;
                "10000-30000"?: undefined;
                "30000-80000"?: undefined;
                "100000+"?: undefined;
                无特殊技能?: undefined;
                "\u76AE\u5212\u8247/\u767B\u5C71/\u91CE\u5916\u751F\u5B58"?: undefined;
                "\u51B0\u5DDD\u6551\u63F4/\u533B\u7597\u6025\u6551/\u5317\u6781\u718A\u9632\u5FA1"?: undefined;
            };
            q1?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
        } | {
            q3: string;
            answers: {
                "\u4F4E\u98CE\u9669\uFF0C\u6709\u5B89\u5168\u4FDD\u969C": string;
                "\u4E2D\u7B49\u98CE\u9669\uFF0C\u6709\u4E13\u4E1A\u5411\u5BFC": string;
                "\u9AD8\u98CE\u9669\uFF0C\u5305\u62EC\u81F4\u547D\u53EF\u80FD": string;
                "0-1\u6B21"?: undefined;
                "2-4\u6B21"?: undefined;
                "5\u6B21\u4EE5\u4E0A"?: undefined;
                日常散步?: undefined;
                "\u5B9A\u671F\u5065\u8EAB/\u8FD0\u52A8"?: undefined;
                专业运动员级别?: undefined;
                "10000-30000"?: undefined;
                "30000-80000"?: undefined;
                "100000+"?: undefined;
                无特殊技能?: undefined;
                "\u76AE\u5212\u8247/\u767B\u5C71/\u91CE\u5916\u751F\u5B58"?: undefined;
                "\u51B0\u5DDD\u6551\u63F4/\u533B\u7597\u6025\u6551/\u5317\u6781\u718A\u9632\u5FA1"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q4?: undefined;
            q5?: undefined;
        } | {
            q4: string;
            answers: {
                "10000-30000": string;
                "30000-80000": string;
                "100000+": string;
                "0-1\u6B21"?: undefined;
                "2-4\u6B21"?: undefined;
                "5\u6B21\u4EE5\u4E0A"?: undefined;
                日常散步?: undefined;
                "\u5B9A\u671F\u5065\u8EAB/\u8FD0\u52A8"?: undefined;
                专业运动员级别?: undefined;
                "\u4F4E\u98CE\u9669\uFF0C\u6709\u5B89\u5168\u4FDD\u969C"?: undefined;
                "\u4E2D\u7B49\u98CE\u9669\uFF0C\u6709\u4E13\u4E1A\u5411\u5BFC"?: undefined;
                "\u9AD8\u98CE\u9669\uFF0C\u5305\u62EC\u81F4\u547D\u53EF\u80FD"?: undefined;
                无特殊技能?: undefined;
                "\u76AE\u5212\u8247/\u767B\u5C71/\u91CE\u5916\u751F\u5B58"?: undefined;
                "\u51B0\u5DDD\u6551\u63F4/\u533B\u7597\u6025\u6551/\u5317\u6781\u718A\u9632\u5FA1"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q5?: undefined;
        } | {
            q5: string;
            answers: {
                无特殊技能: string;
                "\u76AE\u5212\u8247/\u767B\u5C71/\u91CE\u5916\u751F\u5B58": string;
                "\u51B0\u5DDD\u6551\u63F4/\u533B\u7597\u6025\u6551/\u5317\u6781\u718A\u9632\u5FA1": string;
                "0-1\u6B21"?: undefined;
                "2-4\u6B21"?: undefined;
                "5\u6B21\u4EE5\u4E0A"?: undefined;
                日常散步?: undefined;
                "\u5B9A\u671F\u5065\u8EAB/\u8FD0\u52A8"?: undefined;
                专业运动员级别?: undefined;
                "\u4F4E\u98CE\u9669\uFF0C\u6709\u5B89\u5168\u4FDD\u969C"?: undefined;
                "\u4E2D\u7B49\u98CE\u9669\uFF0C\u6709\u4E13\u4E1A\u5411\u5BFC"?: undefined;
                "\u9AD8\u98CE\u9669\uFF0C\u5305\u62EC\u81F4\u547D\u53EF\u80FD"?: undefined;
                "10000-30000"?: undefined;
                "30000-80000"?: undefined;
                "100000+"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
        })[];
    };
    cross_persona_advice: {
        upgrading_skills: {
            from_beginner_to_enthusiast: string[];
            from_enthusiast_to_expert: string[];
        };
        common_mistakes: {
            mistake: string;
            consequence: string;
            prevention: string;
        }[];
    };
    ai_decision_logic: {
        persona_identification: {
            step_1: string;
            step_2: string;
            step_3: string;
            step_4: string;
        };
        safety_first_principle: string;
    };
    red_flags: {
        medical: string[];
        psychological: string[];
        practical: string[];
        safety: string[];
    };
    decision_matrix: {
        GO_FULLY_SUPPORTED: {
            description: string;
            criteria: string[];
            support_level: string;
        };
        GO_WITH_STRONG_CAUTION: {
            description: string;
            criteria: string[];
            support_level: string;
        };
        GO_ALTERNATIVE_PLAN: {
            description: string;
            examples: string[];
        };
        STRONGLY_RECONSIDER: {
            description: string;
            criteria: string[];
            recommendation: string;
        };
        NOT_RECOMMENDED: {
            description: string;
            criteria: string[];
            recommendation: string;
        };
    };
    data_provenance: {
        sources: string[];
        last_review: string;
        next_review: string;
    };
};
