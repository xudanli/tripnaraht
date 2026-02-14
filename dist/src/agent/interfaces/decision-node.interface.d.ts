export type ConstraintType = 'REACHABILITY' | 'SAFETY_CRITICAL' | 'PHYSICAL_LIMIT' | 'LEGAL' | 'DATA_CRITICAL' | 'PREFERENCE' | 'COMFORT' | 'EXPERIENCE' | 'COST';
export type ConstraintHardness = 'HARD' | 'SOFT';
export interface Constraint {
    id: string;
    type: ConstraintType;
    hardness: ConstraintHardness;
    description: string;
    value?: any;
    threshold?: any;
    violation_action: 'BLOCK' | 'ADJUST_REQUIRED' | 'NEED_USER_CONFIRM' | 'WARNING';
    evidence_refs?: string[];
}
export type TradeoffDimension = 'TIME' | 'COST' | 'EXPERIENCE' | 'RISK';
export interface TradeoffModel {
    dimension: TradeoffDimension;
    weight: number;
    current_value: number;
    optimal_value: number;
    acceptable_range: {
        min: number;
        max: number;
    };
    loss_function: string;
}
export interface UncertaintyProfile {
    confidence: number;
    data_quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    uncertainty_sources: Array<{
        source: string;
        impact: 'HIGH' | 'MEDIUM' | 'LOW';
        mitigation?: string;
    }>;
    risk_distribution?: {
        optimistic: number;
        expected: number;
        pessimistic: number;
    };
}
export interface DecisionOption {
    id: string;
    name: string;
    description: string;
    tradeoffs: {
        time: {
            value: number;
            unit: string;
            impact: string;
        };
        cost: {
            value: number;
            currency: string;
            impact: string;
        };
        experience: {
            value: number;
            description: string;
        };
        risk: {
            value: number;
            factors: string[];
        };
    };
    uncertainty: UncertaintyProfile;
    evidence_refs: string[];
    constraint_satisfaction: Array<{
        constraint_id: string;
        satisfied: boolean;
        violation_severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        repair_suggestion?: string;
    }>;
    score: number;
    ranking?: number;
}
export interface DecisionNode {
    id: string;
    type: 'ROOT' | 'BRANCH' | 'LEAF';
    name: string;
    description: string;
    context: {
        destination?: string;
        date_range?: {
            start: string;
            end: string;
        };
        travelers?: {
            count: number;
            profile: string;
        };
        current_phase: string;
        parent_node_id?: string;
    };
    constraints: {
        hard: Constraint[];
        soft: Constraint[];
    };
    preferences: {
        pace: 'SLOW' | 'BALANCED' | 'FAST';
        priority: TradeoffDimension;
        risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
        custom?: Record<string, any>;
    };
    options: DecisionOption[];
    tradeoff_model: TradeoffModel[];
    overall_uncertainty: UncertaintyProfile;
    decision?: {
        selected_option_id: string;
        reasoning: string;
        alternatives_considered: string[];
        user_judgment_required?: Array<{
            question: string;
            options: string[];
            default?: string;
            impact: string;
        }>;
    };
    children?: DecisionNode[];
    metadata: {
        created_at: string;
        updated_at: string;
        decided_at?: string;
        decided_by?: 'SYSTEM' | 'USER';
        version: number;
    };
}
export interface DecisionTree {
    root: DecisionNode;
    total_nodes: number;
    decided_nodes: number;
    pending_nodes: number;
    blocked_nodes: number;
    requires_user_input: boolean;
    user_judgment_points: Array<{
        node_id: string;
        question: string;
        urgency: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
}
export interface ComparisonMatrix {
    plans: Array<{
        plan_id: string;
        name: string;
        summary: string;
    }>;
    dimensions: TradeoffDimension[];
    matrix: Array<{
        dimension: TradeoffDimension;
        values: Array<{
            plan_id: string;
            value: number;
            display: string;
            is_best: boolean;
        }>;
    }>;
    recommendation: {
        plan_id: string;
        confidence: number;
        reasoning: string;
    };
}
export interface DecisionOutput {
    decision_node: DecisionNode;
    ranked_plans: Array<{
        plan: DecisionOption;
        rank: number;
        uncertainty: UncertaintyProfile;
        tradeoffs: Record<TradeoffDimension, {
            value: number;
            impact: string;
        }>;
        what_you_pay_for: string;
        what_you_get: string;
    }>;
    comparison: ComparisonMatrix;
    user_judgment_required: Array<{
        question: string;
        context: string;
        options: Array<{
            id: string;
            label: string;
            impact: string;
        }>;
        recommendation?: string;
    }>;
    evidence_summary: {
        total_evidence: number;
        verified: number;
        unverified: number;
        assumptions: number;
    };
}
