-- Migration: Add Decision Draft Tables
-- Description: 添加 Decision-First Agent 引擎的数据库表结构

-- ========== Decision Draft 表 ==========
CREATE TABLE IF NOT EXISTS decision_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id VARCHAR(255) UNIQUE NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    
    -- Step Draft 关联（JSON 存储）
    step_draft_id VARCHAR(255),
    step_draft_data JSONB,
    
    -- 执行结果（可选）
    execution_result_id VARCHAR(255),
    execution_result_data JSONB,
    
    -- 用户模式
    user_mode VARCHAR(20) NOT NULL DEFAULT 'toc', -- 'toc' | 'expert'
    
    -- 元数据
    decision_count INTEGER NOT NULL DEFAULT 0,
    step_count INTEGER NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 索引
    CONSTRAINT decision_drafts_draft_id_key UNIQUE (draft_id),
    CONSTRAINT decision_drafts_workflow_id_key UNIQUE (workflow_id)
);

CREATE INDEX idx_decision_drafts_workflow_id ON decision_drafts(workflow_id);
CREATE INDEX idx_decision_drafts_draft_id ON decision_drafts(draft_id);
CREATE INDEX idx_decision_drafts_created_at ON decision_drafts(created_at DESC);

-- ========== Decision Step 表 ==========
CREATE TABLE IF NOT EXISTS decision_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_draft_id UUID NOT NULL REFERENCES decision_drafts(id) ON DELETE CASCADE,
    
    -- 基本信息
    step_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    decision_type VARCHAR(50) NOT NULL, -- 'transport-decision' | 'pace-decision' | ...
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'modified'
    confidence FLOAT NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
    
    -- 输入输出（JSON 存储）
    inputs JSONB NOT NULL DEFAULT '[]',
    outputs JSONB NOT NULL DEFAULT '[]',
    
    -- 证据（JSON 存储）
    evidence JSONB NOT NULL DEFAULT '[]',
    
    -- 决策日志（JSON 存储）
    decision_log JSONB NOT NULL DEFAULT '[]',
    
    -- Step Draft 关联
    step_draft_ids TEXT[] NOT NULL DEFAULT '{}',
    
    -- 三人格评审（JSON 存储）
    guardian_review JSONB,
    
    -- 用户反馈（JSON 存储）
    user_feedback JSONB,
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 唯一约束
    CONSTRAINT decision_steps_draft_step_unique UNIQUE (decision_draft_id, step_id)
);

CREATE INDEX idx_decision_steps_draft_id ON decision_steps(decision_draft_id);
CREATE INDEX idx_decision_steps_step_id ON decision_steps(step_id);
CREATE INDEX idx_decision_steps_status ON decision_steps(status);
CREATE INDEX idx_decision_steps_decision_type ON decision_steps(decision_type);

-- ========== Decision Draft Version 表 ==========
CREATE TABLE IF NOT EXISTS decision_draft_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id VARCHAR(255) UNIQUE NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL, -- 'v1.0', 'v1.1', ...
    
    -- Decision Draft 数据（JSON 存储）
    decision_draft_data JSONB NOT NULL,
    
    -- Step Draft 数据（JSON 存储）
    step_draft_data JSONB NOT NULL,
    
    -- 执行结果（可选，JSON 存储）
    execution_result_data JSONB,
    
    -- 版本差异（JSON 存储）
    diff_data JSONB,
    
    -- 元数据
    created_by VARCHAR(255) NOT NULL DEFAULT 'system',
    description TEXT,
    
    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 索引
    CONSTRAINT decision_draft_versions_version_id_key UNIQUE (version_id)
);

CREATE INDEX idx_decision_draft_versions_workflow_id ON decision_draft_versions(workflow_id);
CREATE INDEX idx_decision_draft_versions_version ON decision_draft_versions(workflow_id, version);
CREATE INDEX idx_decision_draft_versions_created_at ON decision_draft_versions(created_at DESC);

-- ========== 添加 updated_at 触发器 ==========
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_decision_drafts_updated_at
    BEFORE UPDATE ON decision_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_decision_steps_updated_at
    BEFORE UPDATE ON decision_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
