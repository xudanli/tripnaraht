-- AI-Native Decision System Tables
-- Decision Replay & RLHF Signal Persistence

-- ============================================================================
-- Decision Snapshots
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_id VARCHAR(64) NOT NULL UNIQUE,
  trip_run_id VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step VARCHAR(32) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  trigger VARCHAR(16) NOT NULL CHECK (trigger IN ('AUTO', 'USER_ACTION', 'CHECKPOINT')),
  state JSONB NOT NULL,
  decision_node JSONB,
  decision_output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_snapshots_trip_run_id ON decision_snapshots(trip_run_id);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_timestamp ON decision_snapshots(timestamp);

-- ============================================================================
-- Decision Timelines (aggregated view, cached)
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_timelines (
  id SERIAL PRIMARY KEY,
  trip_run_id VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_duration_ms INTEGER DEFAULT 0,
  key_decision_points JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_decision_timelines_trip_run_id ON decision_timelines(trip_run_id);

-- ============================================================================
-- Decision Style Models (user preference learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_style_models (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  inferred_preferences JSONB NOT NULL DEFAULT '{
    "pace": "BALANCED",
    "priority": "EXPERIENCE",
    "risk_tolerance": "MEDIUM",
    "budget_sensitivity": "MEDIUM"
  }'::jsonb,
  patterns JSONB DEFAULT '[]'::jsonb,
  learning_signals JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_style_models_user_id ON decision_style_models(user_id);

-- ============================================================================
-- RLHF Behavior Signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS rlhf_behavior_signals (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(64) NOT NULL UNIQUE,
  trip_run_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  signal_type VARCHAR(16) NOT NULL CHECK (signal_type IN ('VIEW', 'CLICK', 'HOVER', 'SCROLL', 'TIME_SPENT', 'EXPAND', 'COLLAPSE')),
  element_type VARCHAR(16) NOT NULL,
  element_id VARCHAR(128) NOT NULL,
  element_context TEXT,
  duration_ms INTEGER,
  scroll_depth FLOAT,
  viewport_visible BOOLEAN,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlhf_behavior_signals_trip_run_id ON rlhf_behavior_signals(trip_run_id);
CREATE INDEX IF NOT EXISTS idx_rlhf_behavior_signals_timestamp ON rlhf_behavior_signals(timestamp);

-- ============================================================================
-- RLHF Execution Signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS rlhf_execution_signals (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(64) NOT NULL UNIQUE,
  trip_run_id VARCHAR(64) NOT NULL,
  signal_type VARCHAR(16) NOT NULL CHECK (signal_type IN ('START', 'DEVIATION', 'SKIP', 'DELAY', 'EARLY', 'COMPLETE', 'ABORT')),
  planned_item_id VARCHAR(128) NOT NULL,
  planned_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ,
  deviation_minutes INTEGER,
  reason TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlhf_execution_signals_trip_run_id ON rlhf_execution_signals(trip_run_id);
CREATE INDEX IF NOT EXISTS idx_rlhf_execution_signals_timestamp ON rlhf_execution_signals(timestamp);

-- ============================================================================
-- RLHF Feedback Signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS rlhf_feedback_signals (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(64) NOT NULL UNIQUE,
  trip_run_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  decision_point_id VARCHAR(128) NOT NULL,
  feedback_type VARCHAR(16) NOT NULL CHECK (feedback_type IN ('ACCEPT', 'REJECT', 'MODIFY', 'QUESTION', 'RATING', 'COMMENT')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  choice VARCHAR(128),
  modification JSONB,
  comment TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rlhf_feedback_signals_trip_run_id ON rlhf_feedback_signals(trip_run_id);
CREATE INDEX IF NOT EXISTS idx_rlhf_feedback_signals_decision_point_id ON rlhf_feedback_signals(decision_point_id);
CREATE INDEX IF NOT EXISTS idx_rlhf_feedback_signals_timestamp ON rlhf_feedback_signals(timestamp);

-- ============================================================================
-- Decision Quality Assessments
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_quality_assessments (
  id SERIAL PRIMARY KEY,
  trip_run_id VARCHAR(64) NOT NULL,
  decision_point_id VARCHAR(128) NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prediction_accuracy FLOAT NOT NULL,
  user_satisfaction FLOAT NOT NULL,
  execution_adherence FLOAT NOT NULL,
  overall_quality FLOAT NOT NULL,
  factors JSONB DEFAULT '[]'::jsonb,
  improvement_signals JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(trip_run_id, decision_point_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_quality_assessments_trip_run_id ON decision_quality_assessments(trip_run_id);

-- ============================================================================
-- Learning Signals (generated from RLHF data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS learning_signals (
  id SERIAL PRIMARY KEY,
  signal_id VARCHAR(64) NOT NULL UNIQUE,
  trip_run_id VARCHAR(64) NOT NULL,
  signal_category VARCHAR(16) NOT NULL CHECK (signal_category IN ('PREFERENCE', 'CONSTRAINT', 'TRADEOFF', 'RISK', 'BEHAVIOR')),
  signal_strength FLOAT NOT NULL,
  observation JSONB NOT NULL,
  learning_target JSONB NOT NULL,
  applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_signals_trip_run_id ON learning_signals(trip_run_id);
CREATE INDEX IF NOT EXISTS idx_learning_signals_applied ON learning_signals(applied);
