-- Decision OS Learning Tables Migration
-- 用于支持决策系统的学习和审计功能
-- 执行前请确保数据库连接正确

-- 1. 用户决策权重表
CREATE TABLE IF NOT EXISTS user_decision_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    
    -- 六维度权重
    time_weight FLOAT NOT NULL DEFAULT 0.2,
    cost_weight FLOAT NOT NULL DEFAULT 0.2,
    experience_weight FLOAT NOT NULL DEFAULT 0.2,
    convenience_weight FLOAT NOT NULL DEFAULT 0.15,
    safety_weight FLOAT NOT NULL DEFAULT 0.15,
    sustainability_weight FLOAT NOT NULL DEFAULT 0.1,
    
    -- 学习元数据
    learning_rate FLOAT NOT NULL DEFAULT 0.01,
    total_decisions INT NOT NULL DEFAULT 0,
    positive_feedback INT NOT NULL DEFAULT 0,
    negative_feedback INT NOT NULL DEFAULT 0,
    
    -- 时间戳
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    
    CONSTRAINT user_decision_weights_user_id_key UNIQUE (user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_decision_weights_user_id ON user_decision_weights(user_id);
CREATE INDEX IF NOT EXISTS idx_user_decision_weights_updated_at ON user_decision_weights(updated_at);

-- 2. 权重学习历史表
CREATE TABLE IF NOT EXISTS weight_learning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    
    -- 权重快照
    weights_before JSONB NOT NULL,
    weights_after JSONB NOT NULL,
    
    -- 触发信息
    trigger_type VARCHAR(50) NOT NULL,
    feedback_score FLOAT,
    decision_outcome VARCHAR(100),
    
    -- 学习指标
    gradient_norm FLOAT,
    step_size FLOAT,
    convergence_metric FLOAT,
    
    -- 元数据
    metadata JSONB,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_weight_learning_user 
        FOREIGN KEY (user_id) 
        REFERENCES user_decision_weights(user_id) 
        ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_weight_learning_history_user_id ON weight_learning_history(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_learning_history_created_at ON weight_learning_history(created_at);
CREATE INDEX IF NOT EXISTS idx_weight_learning_history_trigger_type ON weight_learning_history(trigger_type);

-- 3. DSO 快照审计表
CREATE TABLE IF NOT EXISTS dso_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(255) NOT NULL,
    version INT NOT NULL,
    phase VARCHAR(50) NOT NULL,
    
    -- DSO 数据
    dso_data JSONB NOT NULL,
    
    -- 稳定性指标
    confidence FLOAT,
    lyapunov_value FLOAT,
    
    -- 时间戳
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    
    CONSTRAINT dso_snapshots_request_version_key UNIQUE (request_id, version)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_dso_snapshots_request_id ON dso_snapshots(request_id);
CREATE INDEX IF NOT EXISTS idx_dso_snapshots_created_at ON dso_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_dso_snapshots_phase ON dso_snapshots(phase);

-- 4. 审计日志持久化表 (新增)
CREATE TABLE IF NOT EXISTS decision_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id VARCHAR(100) NOT NULL UNIQUE,
    request_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    
    -- 请求信息
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    
    -- 响应信息
    status_code INT,
    duration_ms INT,
    
    -- 客户端信息
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- 请求/响应体 (脱敏后)
    request_body JSONB,
    response_summary JSONB,
    
    -- 错误信息
    error_name VARCHAR(100),
    error_message TEXT,
    
    -- 元数据
    metadata JSONB,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON decision_audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON decision_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON decision_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON decision_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status_code ON decision_audit_logs(status_code);

-- 5. A/B 测试结果表 (新增)
CREATE TABLE IF NOT EXISTS ab_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_key VARCHAR(100) NOT NULL,
    variant VARCHAR(50) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    
    -- 转化信息
    conversion BOOLEAN NOT NULL DEFAULT FALSE,
    conversion_value FLOAT,
    
    -- 元数据
    metadata JSONB,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ab_test_results_flag_key ON ab_test_results(flag_key);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_user_id ON ab_test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_variant ON ab_test_results(variant);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_created_at ON ab_test_results(created_at);

-- 授权 (根据实际用户调整)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;

COMMENT ON TABLE user_decision_weights IS 'Decision OS 用户决策权重，支持个性化学习';
COMMENT ON TABLE weight_learning_history IS 'Decision OS 权重学习历史，用于追踪学习过程';
COMMENT ON TABLE dso_snapshots IS 'Decision OS DSO 快照，用于审计和稳定性分析';
COMMENT ON TABLE decision_audit_logs IS 'Decision OS 审计日志，持久化存储';
COMMENT ON TABLE ab_test_results IS 'Decision OS A/B 测试结果，用于实验分析';
