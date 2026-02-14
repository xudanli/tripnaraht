import { SEVLevel, RiskCategory } from './enums.interface';
export interface ClarificationPromptTemplate {
    template_id: string;
    scenario: string;
    missing_field: string;
    templates: {
        en: {
            question: string;
            examples?: string[];
            hints?: string[];
        };
        zh: {
            question: string;
            examples?: string[];
            hints?: string[];
        };
    };
    metadata: Record<string, any>;
}
export interface RiskPromptTemplate {
    template_id: string;
    sev_level: SEVLevel;
    category: RiskCategory;
    templates: {
        en: {
            title: string;
            message: string;
            details?: string;
            alternatives?: string[];
            actions: {
                primary: string;
                secondary?: string;
            };
        };
        zh: {
            title: string;
            message: string;
            details?: string;
            alternatives?: string[];
            actions: {
                primary: string;
                secondary?: string;
            };
        };
    };
    interaction: {
        require_confirmation: boolean;
        show_details: boolean;
        show_alternatives: boolean;
    };
}
export interface DecisionExplanationUIDesign {
    design_id: string;
    information_hierarchy: {
        level_1_summary: string;
        level_2_process: string;
        level_3_evidence: string;
    };
    visualization_formats: Array<{
        type: 'DECISION_TREE' | 'EVIDENCE_GRAPH' | 'TIMELINE';
        description: string;
        use_case: string;
    }>;
    user_friendly_format: {
        summary_length: number;
        detail_expandable: boolean;
        evidence_collapsible: boolean;
    };
}
export interface RedLineRule {
    rule_id: string;
    name: string;
    destination?: string;
    condition: string;
    action: 'BLOCK' | 'REQUIRE_APPROVAL' | 'WARN';
    sev_level: 'SEV-1' | 'SEV-2';
    description: string;
    examples: string[];
}
export interface SeasonalRisk {
    risk_id: string;
    destination: string;
    risk_months: number[];
    risk_type: 'WEATHER' | 'SAFETY' | 'ACCESSIBILITY';
    description: string;
    mitigation_measures: string[];
    sev_level: 'SEV-1' | 'SEV-2' | 'SEV-3';
}
export interface EvaluationSetAnnotation {
    annotation_id: string;
    test_case_id: string;
    annotator: string;
    labels: {
        executability: 'EXECUTABLE' | 'PARTIALLY_EXECUTABLE' | 'NOT_EXECUTABLE';
        danger_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        quality_score: number;
    };
    notes?: string;
    annotated_at: string;
}
export interface AntiPatternCase {
    case_id: string;
    incident_type: string;
    description: string;
    root_cause: string;
    pattern: string;
    prevention_measures: string[];
    related_rules: string[];
}
export interface JudgePromptTemplate {
    template_id: string;
    name: string;
    scoring_criteria: Array<{
        criterion: string;
        weight: number;
        description: string;
    }>;
    prompt_template: string;
    calibration_examples: Array<{
        input: any;
        expected_score: number;
        reasoning: string;
    }>;
}
export interface DiagnosticLabel {
    label_id: string;
    label_type: 'EVIDENCE_MISSING' | 'HALLUCINATION_RISK' | 'NOT_EXECUTABLE' | 'SAFETY_CONCERN' | 'COMPLIANCE_ISSUE';
    description: string;
    detection_criteria: string;
    impact_on_score: number;
}
export interface QualityScoreResult {
    score: number;
    llm_judge_score?: number;
    rm_score?: number;
    diagnostic_labels: DiagnosticLabel[];
    explanation: string;
    confidence: number;
}
