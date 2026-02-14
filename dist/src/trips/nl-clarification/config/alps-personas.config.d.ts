export declare const ALPS_USER_PERSONAS: {
    metadata: {
        version: string;
        last_updated: string;
        description: string;
        credibility_score: number;
        language: string;
        region: string;
        structure_reference: string;
    };
    overview: {
        purpose: string;
        philosophy: string;
        regional_context: string;
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
            budget_eur: string;
            motivations: string[];
        };
        recommended_routes: {
            route: string;
            reason: string;
            difficulty_match: string;
            season: string;
        }[];
        not_recommended: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            cultural_immersion: string;
            natural_beauty: string;
            comfort_level: string;
            technical_requirement: string;
            self_reliance?: undefined;
            technical_challenge?: undefined;
            mental_challenge?: undefined;
            exposure?: undefined;
            isolation?: undefined;
            reward?: undefined;
        };
        typical_itinerary: {
            day_1: string;
            day_2: string;
            day_3: string;
            day_4: string;
            day_5_6: string;
            day_7: string;
        };
        success_factors: string[];
        altitude_acclimatization: {
            max_comfortable_altitude: string;
            max_safe_altitude_with_cable_car: string;
            acclimatization_needs: string;
            acclimatization_strategy?: undefined;
            altitude_sickness_risk?: undefined;
            management?: undefined;
        };
        cost_breakdown: {
            accommodation_per_night: string;
            meals_per_day: string;
            cable_cars_activities: string;
            total_weekly_estimate: string;
            mountain_hut_night?: undefined;
            meals_self_provided?: undefined;
            cable_cars_shortcuts?: undefined;
            guides_if_needed?: undefined;
            professional_guide_per_day?: undefined;
            mountain_hut_expeditions?: undefined;
            logistics_and_transport?: undefined;
            equipment_investment?: undefined;
            total_expedition_estimate?: undefined;
        };
        stretch_goals?: undefined;
        typical_itinerary_tmb?: undefined;
        advanced_objectives?: undefined;
        required_qualifications?: undefined;
        typical_expedition_mont_blanc?: undefined;
        typical_expedition_haute_route?: undefined;
        risk_reality?: undefined;
        experience_level?: undefined;
        season?: undefined;
        risk_considerations?: undefined;
        decision_daily?: undefined;
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
            budget_eur: string;
            motivations: string[];
        };
        recommended_routes: ({
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
            season: string;
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            season: string;
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
            technical_requirement: string;
            self_reliance: string;
            technical_challenge?: undefined;
            mental_challenge?: undefined;
            exposure?: undefined;
            isolation?: undefined;
            reward?: undefined;
        };
        typical_itinerary_tmb: {
            day_1: string;
            day_2_3: string;
            day_4_5: string;
            day_6_7: string;
            day_8_9: string;
        };
        success_factors: string[];
        altitude_acclimatization: {
            max_comfortable_altitude: string;
            acclimatization_strategy: string;
            altitude_sickness_risk: string;
            management: string;
            max_safe_altitude_with_cable_car?: undefined;
            acclimatization_needs?: undefined;
        };
        cost_breakdown: {
            mountain_hut_night: string;
            meals_self_provided: string;
            cable_cars_shortcuts: string;
            guides_if_needed: string;
            total_weekly_estimate: string;
            accommodation_per_night?: undefined;
            meals_per_day?: undefined;
            cable_cars_activities?: undefined;
            professional_guide_per_day?: undefined;
            mountain_hut_expeditions?: undefined;
            logistics_and_transport?: undefined;
            equipment_investment?: undefined;
            total_expedition_estimate?: undefined;
        };
        typical_itinerary?: undefined;
        advanced_objectives?: undefined;
        required_qualifications?: undefined;
        typical_expedition_mont_blanc?: undefined;
        typical_expedition_haute_route?: undefined;
        risk_reality?: undefined;
        experience_level?: undefined;
        season?: undefined;
        risk_considerations?: undefined;
        decision_daily?: undefined;
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
            budget_eur: string;
            motivations: string[];
        };
        recommended_routes: ({
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
            season: string;
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            season: string;
            prerequisites?: undefined;
        })[];
        advanced_objectives: ({
            route: string;
            technical_grade: string;
            condition: string;
        } | {
            route: string;
            condition: string;
            technical_grade?: undefined;
        })[];
        not_recommended: string[];
        required_qualifications: string[];
        preparation_needs: string[];
        expected_experiences: {
            physical_challenge: string;
            technical_challenge: string;
            mental_challenge: string;
            exposure: string;
            isolation: string;
            reward: string;
            cultural_immersion?: undefined;
            natural_beauty?: undefined;
            comfort_level?: undefined;
            technical_requirement?: undefined;
            self_reliance?: undefined;
        };
        typical_expedition_mont_blanc: {
            duration: string;
            day_1: string;
            day_2: string;
            day_3: string;
            day_4: string;
        };
        typical_expedition_haute_route: {
            duration: string;
            day_1_3: string;
            day_4_6: string;
            day_7_10: string;
        };
        success_factors: string[];
        altitude_acclimatization: {
            max_comfortable_altitude: string;
            acclimatization_strategy: string;
            altitude_sickness_risk: string;
            management: string;
            max_safe_altitude_with_cable_car?: undefined;
            acclimatization_needs?: undefined;
        };
        risk_reality: {
            success_rate: string;
            incident_rate: string;
            fatality_rate: string;
            common_incidents: string[];
            note: string;
        };
        cost_breakdown: {
            professional_guide_per_day: string;
            mountain_hut_expeditions: string;
            logistics_and_transport: string;
            equipment_investment: string;
            total_expedition_estimate: string;
            accommodation_per_night?: undefined;
            meals_per_day?: undefined;
            cable_cars_activities?: undefined;
            total_weekly_estimate?: undefined;
            mountain_hut_night?: undefined;
            meals_self_provided?: undefined;
            cable_cars_shortcuts?: undefined;
            guides_if_needed?: undefined;
        };
        typical_itinerary?: undefined;
        stretch_goals?: undefined;
        typical_itinerary_tmb?: undefined;
        experience_level?: undefined;
        season?: undefined;
        risk_considerations?: undefined;
        decision_daily?: undefined;
    } | {
        persona_id: string;
        persona_name: string;
        persona_name_en: string;
        percentage_of_visitors: string;
        experience_level: string;
        season: string;
        characteristics: {
            physical_fitness: string;
            risk_tolerance: string;
            time_available: string;
            budget_eur: string;
            motivations: string[];
            experience_level?: undefined;
        };
        recommended_routes: ({
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
            duration: string;
            season: string;
        } | {
            route: string;
            reason: string;
            difficulty_match: string;
            prerequisites: string[];
            season: string;
            duration?: undefined;
        })[];
        required_qualifications: string[];
        preparation_needs: string[];
        risk_considerations: string[];
        decision_daily: string[];
        not_recommended?: undefined;
        expected_experiences?: undefined;
        typical_itinerary?: undefined;
        success_factors?: undefined;
        altitude_acclimatization?: undefined;
        cost_breakdown?: undefined;
        stretch_goals?: undefined;
        typical_itinerary_tmb?: undefined;
        advanced_objectives?: undefined;
        typical_expedition_mont_blanc?: undefined;
        typical_expedition_haute_route?: undefined;
        risk_reality?: undefined;
    })[];
    persona_assessment_tool: {
        how_to_use: string;
        questions: ({
            q1: string;
            answers: {
                从未登山或只在平地步行: string;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09": string;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09": string;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B": string;
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8"?: undefined;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6"?: undefined;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71"?: undefined;
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002"?: undefined;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C"?: undefined;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025"?: undefined;
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09"?: undefined;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09"?: undefined;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09"?: undefined;
                没有特殊登山技能?: undefined;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B"?: undefined;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406"?: undefined;
                低于1500m?: undefined;
                "1500-3000m"?: undefined;
                "3000-4000m"?: undefined;
                "4000m+"?: undefined;
            };
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
        } | {
            q2: string;
            answers: {
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8": string;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6": string;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71": string;
                从未登山或只在平地步行?: undefined;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09"?: undefined;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09"?: undefined;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B"?: undefined;
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002"?: undefined;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C"?: undefined;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025"?: undefined;
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09"?: undefined;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09"?: undefined;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09"?: undefined;
                没有特殊登山技能?: undefined;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B"?: undefined;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406"?: undefined;
                低于1500m?: undefined;
                "1500-3000m"?: undefined;
                "3000-4000m"?: undefined;
                "4000m+"?: undefined;
            };
            q1?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
        } | {
            q3: string;
            answers: {
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002": string;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C": string;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025": string;
                从未登山或只在平地步行?: undefined;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09"?: undefined;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09"?: undefined;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B"?: undefined;
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8"?: undefined;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6"?: undefined;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71"?: undefined;
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09"?: undefined;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09"?: undefined;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09"?: undefined;
                没有特殊登山技能?: undefined;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B"?: undefined;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406"?: undefined;
                低于1500m?: undefined;
                "1500-3000m"?: undefined;
                "3000-4000m"?: undefined;
                "4000m+"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q4?: undefined;
            q5?: undefined;
            q6?: undefined;
        } | {
            q4: string;
            answers: {
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09": string;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09": string;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09": string;
                从未登山或只在平地步行?: undefined;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09"?: undefined;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09"?: undefined;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B"?: undefined;
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8"?: undefined;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6"?: undefined;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71"?: undefined;
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002"?: undefined;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C"?: undefined;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025"?: undefined;
                没有特殊登山技能?: undefined;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B"?: undefined;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406"?: undefined;
                低于1500m?: undefined;
                "1500-3000m"?: undefined;
                "3000-4000m"?: undefined;
                "4000m+"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q5?: undefined;
            q6?: undefined;
        } | {
            q5: string;
            answers: {
                没有特殊登山技能: string;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B": string;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406": string;
                从未登山或只在平地步行?: undefined;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09"?: undefined;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09"?: undefined;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B"?: undefined;
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8"?: undefined;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6"?: undefined;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71"?: undefined;
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002"?: undefined;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C"?: undefined;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025"?: undefined;
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09"?: undefined;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09"?: undefined;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09"?: undefined;
                低于1500m?: undefined;
                "1500-3000m"?: undefined;
                "3000-4000m"?: undefined;
                "4000m+"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q6?: undefined;
        } | {
            q6: string;
            answers: {
                低于1500m: string;
                "1500-3000m": string;
                "3000-4000m": string;
                "4000m+": string;
                从未登山或只在平地步行?: undefined;
                "\u67091-3\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u6700\u9AD82000m\uFF09"?: undefined;
                "\u6709\u591A\u6B21\u767B\u5C71\u7ECF\u9A8C\uFF08\u8FBE\u52303000m+\uFF09"?: undefined;
                "\u591A\u6B214000m+\u767B\u9876\u6216\u6280\u672F\u6500\u767B"?: undefined;
                "\u65E5\u5E38\u6563\u6B65\uFF0C\u4E0D\u5B9A\u671F\u8FD0\u52A8"?: undefined;
                "\u5B9A\u671F\u8FD0\u52A8\uFF08\u6BCF\u54683\u6B21\uFF09\uFF0C\u53EF\u8FDE\u7EED\u6D3B\u52A84-6\u5C0F\u65F6"?: undefined;
                "\u9AD8\u5F3A\u5EA6\u8BAD\u7EC3\uFF0C\u53EF\u627F\u53D78\u5C0F\u65F6+\u767B\u5C71"?: undefined;
                "\u4E0D\u60F3\u627F\u53D7\u4E25\u91CD\u98CE\u9669\uFF0C\u9700\u8981\u5B89\u5168\u4FDD\u969C\u548C\u8212\u9002"?: undefined;
                "\u53EF\u4EE5\u63A5\u53D7\u4E2D\u7B49\u98CE\u9669\u548C\u4E0D\u9002\uFF08\u6076\u52A3\u5929\u6C14\u3001\u808C\u8089\u9178\u75DB\uFF09\uFF0C\u6709\u5411\u5BFC\u6216\u670B\u53CB\u540C\u884C"?: undefined;
                "\u80FD\u63A5\u53D7\u9AD8\u98CE\u9669\u548C\u6781\u7AEF\u4E0D\u9002\uFF08\u5BD2\u51B7\u3001\u66B4\u9732\u3001\u6280\u672F\u96BE\u5EA6\uFF09\uFF0C\u6709\u80FD\u529B\u5E94\u6025"?: undefined;
                "EUR 1500-3000\uFF08\u4E00\u5468\uFF09"?: undefined;
                "EUR 2000-6000\uFF0810\u5929-2\u5468\uFF09"?: undefined;
                "EUR 3000+\uFF08\u5305\u62EC\u5411\u5BFC\u548C\u88C5\u5907\uFF09"?: undefined;
                没有特殊登山技能?: undefined;
                "\u4F1A\u57FA\u7840\u5BFC\u822A\u3001\u591A\u65E5\u80CC\u5305\u9732\u8425\u3001\u6216\u53C2\u52A0\u8FC7\u767B\u5C71\u8BFE\u7A0B"?: undefined;
                "\u5CA9\u77F3\u6500\u767B\u3001\u51B0\u5DDD\u6551\u63F4\u3001\u51B0\u722A\u4F7F\u7528\u3001\u7EF3\u7EC4\u7BA1\u7406"?: undefined;
            };
            q1?: undefined;
            q2?: undefined;
            q3?: undefined;
            q4?: undefined;
            q5?: undefined;
        })[];
    };
    cross_persona_advice: {
        upgrading_skills: {
            from_beginner_to_enthusiast: string[];
            from_enthusiast_to_mountaineer: string[];
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
            step_5: string;
        };
        safety_first_principle: string;
        key_decisions: string[];
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
    regional_advantages: {
        alps_vs_other_regions: {
            advantages: string[];
            challenges: string[];
        };
    };
    data_provenance: {
        sources: string[];
        credibility_notes: string;
        last_review: string;
        next_review: string;
    };
};
