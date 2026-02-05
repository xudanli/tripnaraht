-- Migration: Add Decision Feedback Tables
-- Description: 添加决策引擎反馈系统的数据库表结构（P2任务）
-- Date: 2026-02-02

-- ========== 计划变体反馈表 ==========
CREATE TABLE IF NOT EXISTS decision_plan_variant_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id VARCHAR(255) UNIQUE NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  variant_id VARCHAR(255) NOT NULL,
  variant_strategy VARCHAR(50) NOT NULL CHECK (variant_strategy IN ('conservative', 'balanced', 'aggressive')),
  user_choice VARCHAR(50) NOT NULL CHECK (user_choice IN ('selected', 'rejected', 'modified')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  reason TEXT,
  trip_id VARCHAR(255),
  user_id VARCHAR(255),
  feedback_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT decision_plan_variant_feedback_feedback_id_key UNIQUE (feedback_id)
);

CREATE INDEX idx_decision_plan_variant_feedback_run_id ON decision_plan_variant_feedback(run_id);
CREATE INDEX idx_decision_plan_variant_feedback_variant_id ON decision_plan_variant_feedback(variant_id);
CREATE INDEX idx_decision_plan_variant_feedback_trip_id ON decision_plan_variant_feedback(trip_id);
CREATE INDEX idx_decision_plan_variant_feedback_user_id ON decision_plan_variant_feedback(user_id);
CREATE INDEX idx_decision_plan_variant_feedback_variant_strategy ON decision_plan_variant_feedback(variant_strategy);
CREATE INDEX idx_decision_plan_variant_feedback_user_choice ON decision_plan_variant_feedback(user_choice);
CREATE INDEX idx_decision_plan_variant_feedback_rating ON decision_plan_variant_feedback(rating);
CREATE INDEX idx_decision_plan_variant_feedback_feedback_at ON decision_plan_variant_feedback(feedback_at DESC);

COMMENT ON TABLE decision_plan_variant_feedback IS '计划变体反馈表，用于收集用户对计划变体的反馈';
COMMENT ON COLUMN decision_plan_variant_feedback.feedback_id IS '反馈ID（唯一标识）';
COMMENT ON COLUMN decision_plan_variant_feedback.run_id IS '决策运行ID';
COMMENT ON COLUMN decision_plan_variant_feedback.variant_id IS '变体ID';
COMMENT ON COLUMN decision_plan_variant_feedback.variant_strategy IS '变体策略（conservative/balanced/aggressive）';
COMMENT ON COLUMN decision_plan_variant_feedback.user_choice IS '用户选择（selected/rejected/modified）';
COMMENT ON COLUMN decision_plan_variant_feedback.rating IS '评分（1-5）';

-- ========== 约束冲突反馈表 ==========
CREATE TABLE IF NOT EXISTS decision_conflict_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id VARCHAR(255) UNIQUE NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  conflict_id VARCHAR(255) NOT NULL,
  conflict_type VARCHAR(255) NOT NULL,
  understood BOOLEAN NOT NULL,
  explanation_clear BOOLEAN NOT NULL,
  tradeoff_options_useful BOOLEAN NOT NULL,
  selected_tradeoff_option TEXT,
  trip_id VARCHAR(255),
  user_id VARCHAR(255),
  feedback_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT decision_conflict_feedback_feedback_id_key UNIQUE (feedback_id)
);

CREATE INDEX idx_decision_conflict_feedback_run_id ON decision_conflict_feedback(run_id);
CREATE INDEX idx_decision_conflict_feedback_conflict_id ON decision_conflict_feedback(conflict_id);
CREATE INDEX idx_decision_conflict_feedback_conflict_type ON decision_conflict_feedback(conflict_type);
CREATE INDEX idx_decision_conflict_feedback_trip_id ON decision_conflict_feedback(trip_id);
CREATE INDEX idx_decision_conflict_feedback_user_id ON decision_conflict_feedback(user_id);
CREATE INDEX idx_decision_conflict_feedback_understood ON decision_conflict_feedback(understood);
CREATE INDEX idx_decision_conflict_feedback_explanation_clear ON decision_conflict_feedback(explanation_clear);
CREATE INDEX idx_decision_conflict_feedback_tradeoff_options_useful ON decision_conflict_feedback(tradeoff_options_useful);
CREATE INDEX idx_decision_conflict_feedback_feedback_at ON decision_conflict_feedback(feedback_at DESC);

COMMENT ON TABLE decision_conflict_feedback IS '约束冲突反馈表，用于收集用户对约束冲突解释和权衡选项的反馈';
COMMENT ON COLUMN decision_conflict_feedback.feedback_id IS '反馈ID（唯一标识）';
COMMENT ON COLUMN decision_conflict_feedback.run_id IS '决策运行ID';
COMMENT ON COLUMN decision_conflict_feedback.conflict_id IS '冲突ID';
COMMENT ON COLUMN decision_conflict_feedback.conflict_type IS '冲突类型';
COMMENT ON COLUMN decision_conflict_feedback.understood IS '冲突是否被理解';
COMMENT ON COLUMN decision_conflict_feedback.explanation_clear IS '冲突解释是否清晰';
COMMENT ON COLUMN decision_conflict_feedback.tradeoff_options_useful IS '权衡选项是否有用';
COMMENT ON COLUMN decision_conflict_feedback.selected_tradeoff_option IS '用户选择的权衡选项';

-- ========== 决策质量反馈表 ==========
CREATE TABLE IF NOT EXISTS decision_quality_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id VARCHAR(255) UNIQUE NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  overall_satisfaction INTEGER NOT NULL CHECK (overall_satisfaction >= 1 AND overall_satisfaction <= 5),
  plan_quality INTEGER NOT NULL CHECK (plan_quality >= 1 AND plan_quality <= 5),
  conflict_explanation_quality INTEGER CHECK (conflict_explanation_quality >= 1 AND conflict_explanation_quality <= 5),
  tradeoff_options_quality INTEGER CHECK (tradeoff_options_quality >= 1 AND tradeoff_options_quality <= 5),
  decision_speed INTEGER CHECK (decision_speed >= 1 AND decision_speed <= 5),
  additional_feedback TEXT,
  trip_id VARCHAR(255),
  user_id VARCHAR(255),
  feedback_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT decision_quality_feedback_feedback_id_key UNIQUE (feedback_id)
);

CREATE INDEX idx_decision_quality_feedback_run_id ON decision_quality_feedback(run_id);
CREATE INDEX idx_decision_quality_feedback_trip_id ON decision_quality_feedback(trip_id);
CREATE INDEX idx_decision_quality_feedback_user_id ON decision_quality_feedback(user_id);
CREATE INDEX idx_decision_quality_feedback_overall_satisfaction ON decision_quality_feedback(overall_satisfaction);
CREATE INDEX idx_decision_quality_feedback_plan_quality ON decision_quality_feedback(plan_quality);
CREATE INDEX idx_decision_quality_feedback_feedback_at ON decision_quality_feedback(feedback_at DESC);

COMMENT ON TABLE decision_quality_feedback IS '决策质量反馈表，用于收集用户对整体决策质量的反馈';
COMMENT ON COLUMN decision_quality_feedback.feedback_id IS '反馈ID（唯一标识）';
COMMENT ON COLUMN decision_quality_feedback.run_id IS '决策运行ID';
COMMENT ON COLUMN decision_quality_feedback.overall_satisfaction IS '整体满意度（1-5）';
COMMENT ON COLUMN decision_quality_feedback.plan_quality IS '计划质量评分（1-5）';
COMMENT ON COLUMN decision_quality_feedback.conflict_explanation_quality IS '冲突解释质量（1-5）';
COMMENT ON COLUMN decision_quality_feedback.tradeoff_options_quality IS '权衡选项质量（1-5）';
COMMENT ON COLUMN decision_quality_feedback.decision_speed IS '决策速度评分（1-5）';
