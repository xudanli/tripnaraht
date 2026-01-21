// src/agent/training/interfaces/enhancement.interface.ts

import { SEVLevel, RiskCategory } from './enums.interface';

/**
 * 增强能力相关接口定义
 */

/**
 * 追问话术模板
 */
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

/**
 * 风险提示模板
 */
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

/**
 * 决策解释UI设计
 */
export interface DecisionExplanationUIDesign {
  design_id: string;
  information_hierarchy: {
    level_1_summary: string; // 摘要层
    level_2_process: string; // 过程层
    level_3_evidence: string; // 证据层
  };
  visualization_formats: Array<{
    type: 'DECISION_TREE' | 'EVIDENCE_GRAPH' | 'TIMELINE';
    description: string;
    use_case: string;
  }>;
  user_friendly_format: {
    summary_length: number; // 字符数
    detail_expandable: boolean;
    evidence_collapsible: boolean;
  };
}

/**
 * 红线规则
 */
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

/**
 * 季节性风险
 */
export interface SeasonalRisk {
  risk_id: string;
  destination: string;
  risk_months: number[]; // 1-12
  risk_type: 'WEATHER' | 'SAFETY' | 'ACCESSIBILITY';
  description: string;
  mitigation_measures: string[];
  sev_level: 'SEV-1' | 'SEV-2' | 'SEV-3';
}

/**
 * 评测集标注
 */
export interface EvaluationSetAnnotation {
  annotation_id: string;
  test_case_id: string;
  annotator: string;
  labels: {
    executability: 'EXECUTABLE' | 'PARTIALLY_EXECUTABLE' | 'NOT_EXECUTABLE';
    danger_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    quality_score: number; // 0-1
  };
  notes?: string;
  annotated_at: string;
}

/**
 * 反例库条目
 */
export interface AntiPatternCase {
  case_id: string;
  incident_type: string;
  description: string;
  root_cause: string;
  pattern: string;
  prevention_measures: string[];
  related_rules: string[];
}

/**
 * Judge Prompt模板
 */
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

/**
 * 诊断标签
 */
export interface DiagnosticLabel {
  label_id: string;
  label_type: 'EVIDENCE_MISSING' | 'HALLUCINATION_RISK' | 'NOT_EXECUTABLE' | 'SAFETY_CONCERN' | 'COMPLIANCE_ISSUE';
  description: string;
  detection_criteria: string;
  impact_on_score: number; // -1 to 1
}

/**
 * 质量评分结果
 */
export interface QualityScoreResult {
  score: number; // 0-1
  llm_judge_score?: number;
  rm_score?: number;
  diagnostic_labels: DiagnosticLabel[];
  explanation: string;
  confidence: number; // 0-1
}
