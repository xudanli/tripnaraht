-- Round 3: Self-Evolution Architecture - Database Schema Extensions
-- This migration adds tables and fields for the self-evolution system:
-- - TravelOutcome extensions (6-dimension scoring, Shapley attribution, memory snapshot)
-- - CompanionCalibration (pre-trip vs post-trip calibration loop)
-- - DecisionMemory (episodic and semantic memory with ACT-R decay)
-- - GroupFairnessCounter (sequential fairness for group aggregation)

-- ============================================
-- 1. Extend TravelOutcome table
-- ============================================

-- Add self-evolution fields to travel_outcomes
ALTER TABLE travel_outcomes
ADD COLUMN IF NOT EXISTS expectation_gap FLOAT,
ADD COLUMN IF NOT EXISTS companion_satisfaction_detailed JSONB,
ADD COLUMN IF NOT EXISTS stress_event_count INTEGER,
ADD COLUMN IF NOT EXISTS group_aggregation_strategy VARCHAR(32),
ADD COLUMN IF NOT EXISTS shapley_attribution JSONB,
ADD COLUMN IF NOT EXISTS memory_snapshot JSONB,
ADD COLUMN IF NOT EXISTS overall_satisfaction_weight FLOAT DEFAULT 0.25,
ADD COLUMN IF NOT EXISTS companion_satisfaction_weight FLOAT DEFAULT 0.20,
ADD COLUMN IF NOT EXISTS budget_accuracy_weight FLOAT DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS completion_quality_weight FLOAT DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS safety_weight FLOAT DEFAULT 0.15,
ADD COLUMN IF NOT EXISTS repurchase_weight FLOAT DEFAULT 0.10;

-- Add comments for new fields
COMMENT ON COLUMN travel_outcomes.expectation_gap IS '期望差距：实际满意度 vs 预期满意度 (Round 3)';
COMMENT ON COLUMN travel_outcomes.companion_satisfaction_detailed IS '搭子满意度细分数据 (Round 3)';
COMMENT ON COLUMN travel_outcomes.stress_event_count IS '压力事件计数 (Round 3)';
COMMENT ON COLUMN travel_outcomes.group_aggregation_strategy IS '群组聚合策略 (e.g., WLM, Average) (Round 3)';
COMMENT ON COLUMN travel_outcomes.shapley_attribution IS 'Shapley Value 归因结果 (Round 3)';
COMMENT ON COLUMN travel_outcomes.memory_snapshot IS '记忆快照 (Round 3)';
COMMENT ON COLUMN travel_outcomes.overall_satisfaction_weight IS '整体满意度权重 (默认 0.25) (Round 3)';
COMMENT ON COLUMN travel_outcomes.companion_satisfaction_weight IS '搭子关系满意度权重 (默认 0.20) (Round 3)';
COMMENT ON COLUMN travel_outcomes.budget_accuracy_weight IS '预算准确度权重 (默认 0.15) (Round 3)';
COMMENT ON COLUMN travel_outcomes.completion_quality_weight IS '行程完成质量权重 (默认 0.15) (Round 3)';
COMMENT ON COLUMN travel_outcomes.safety_weight IS '安全/无事故权重 (默认 0.15) (Round 3)';
COMMENT ON COLUMN travel_outcomes.repurchase_weight IS '复购/推荐意愿权重 (默认 0.10) (Round 3)';

-- ============================================
-- 2. Create CompanionCalibration table
-- ============================================

CREATE TABLE IF NOT EXISTS companion_calibrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    application_id UUID NOT NULL,
    pre_trip_prediction FLOAT NOT NULL, -- 0-1
    post_trip_satisfaction FLOAT NOT NULL, -- 0-1
    calibration_curve JSONB,
    dimension_scores JSONB, -- 10维各自校准
    calibration_accuracy FLOAT,
    needs_retraining BOOLEAN DEFAULT FALSE,
    trip_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_companion_calibrations_post_id ON companion_calibrations(post_id);
CREATE INDEX IF NOT EXISTS idx_companion_calibrations_application_id ON companion_calibrations(application_id);
CREATE INDEX IF NOT EXISTS idx_companion_calibrations_trip_id ON companion_calibrations(trip_id);
CREATE INDEX IF NOT EXISTS idx_companion_calibrations_created_at ON companion_calibrations(created_at DESC);

-- Add comments
COMMENT ON TABLE companion_calibrations IS '搭子校准：pre-trip 预测 vs post-trip 实际满意度 (Round 3)';
COMMENT ON COLUMN companion_calibrations.pre_trip_prediction IS '旅行前的兼容性预测分数 (0-1)';
COMMENT ON COLUMN companion_calibrations.post_trip_satisfaction IS '旅行后的实际满意度分数 (0-1)';
COMMENT ON COLUMN companion_calibrations.calibration_curve IS '校准曲线数据';
COMMENT ON COLUMN companion_calibrations.dimension_scores IS '10维兼容性各自的校准分数';
COMMENT ON COLUMN companion_calibrations.calibration_accuracy IS '校准准确度';
COMMENT ON COLUMN companion_calibrations.needs_retraining IS '是否需要重新训练模型';

-- ============================================
-- 3. Create DecisionMemory table
-- ============================================

CREATE TABLE IF NOT EXISTS decision_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    trip_id TEXT,
    memory_type VARCHAR(16) NOT NULL, -- episodic, semantic
    content TEXT NOT NULL, -- Natural language summary
    embedding vector(1536),
    activation_score FLOAT DEFAULT 1.0, -- ACT-R activation
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    access_history JSONB, -- Array of access timestamps
    seasonality_factor JSONB, -- Seasonal activation
    social_correction JSONB, -- Social relationship correction
    confidence FLOAT DEFAULT 0.5,
    source_memory_ids TEXT[] DEFAULT '{}',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_decision_memories_user_id ON decision_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_decision_memories_trip_id ON decision_memories(trip_id);
CREATE INDEX IF NOT EXISTS idx_decision_memories_memory_type ON decision_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_decision_memories_activation_score ON decision_memories(activation_score DESC);
CREATE INDEX IF NOT EXISTS idx_decision_memories_last_accessed_at ON decision_memories(last_accessed_at DESC);

-- Add vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_decision_memories_embedding_cosine ON decision_memories
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add comments
COMMENT ON TABLE decision_memories IS '决策记忆：情景记忆和语义记忆 (Round 3)';
COMMENT ON COLUMN decision_memories.memory_type IS '记忆类型: episodic (情景) 或 semantic (语义)';
COMMENT ON COLUMN decision_memories.content IS '自然语言摘要';
COMMENT ON COLUMN decision_memories.embedding IS '向量嵌入，用于相似度检索';
COMMENT ON COLUMN decision_memories.activation_score IS 'ACT-R 激活度分数';
COMMENT ON COLUMN decision_memories.last_accessed_at IS '最后访问时间';
COMMENT ON COLUMN decision_memories.access_history IS '访问历史时间戳数组';
COMMENT ON COLUMN decision_memories.seasonality_factor IS '季节性激活因子';
COMMENT ON COLUMN decision_memories.social_correction IS '社交关系修正因子';
COMMENT ON COLUMN decision_memories.source_memory_ids IS '语义记忆的源记忆ID数组';

-- ============================================
-- 4. Create GroupFairnessCounter table
-- ============================================

CREATE TABLE IF NOT EXISTS group_fairness_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    satisfaction_count INTEGER DEFAULT 0,
    total_trips INTEGER DEFAULT 0,
    last_satisfied_at TIMESTAMPTZ,
    fairness_weight FLOAT DEFAULT 1.0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_group_fairness_counters_fairness_weight ON group_fairness_counters(fairness_weight DESC);

-- Add comments
COMMENT ON TABLE group_fairness_counters IS '群组公平性计数器：序列公平 (Round 3)';
COMMENT ON COLUMN group_fairness_counters.satisfaction_count IS '满意度计数';
COMMENT ON COLUMN group_fairness_counters.total_trips IS '总旅行次数';
COMMENT ON COLUMN group_fairness_counters.last_satisfied_at IS '最后一次满意的时间';
COMMENT ON COLUMN group_fairness_counters.fairness_weight IS '公平性权重 (用于 WLM 聚合)';

-- ============================================
-- 5. Create trigger for updated_at
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for each table
CREATE TRIGGER update_companion_calibrations_updated_at
    BEFORE UPDATE ON companion_calibrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_decision_memories_updated_at
    BEFORE UPDATE ON decision_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_fairness_counters_updated_at
    BEFORE UPDATE ON group_fairness_counters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. Add foreign key constraints (optional)
-- ============================================

-- Note: Foreign keys to match_square_posts and match_square_applications
-- are commented out to avoid circular dependencies. Add if needed.

-- ALTER TABLE companion_calibrations
-- ADD CONSTRAINT fk_companion_calibrations_post_id
-- FOREIGN KEY (post_id) REFERENCES match_square_posts(id) ON DELETE CASCADE;

-- ALTER TABLE companion_calibrations
-- ADD CONSTRAINT fk_companion_calibrations_application_id
-- FOREIGN KEY (application_id) REFERENCES match_square_applications(id) ON DELETE CASCADE;
