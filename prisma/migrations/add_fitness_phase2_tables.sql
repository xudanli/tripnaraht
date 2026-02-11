-- Phase 2: 体能数据分析 - 数据库迁移
-- 创建时间: 2026-02
-- 描述: A/B测试、可穿戴设备集成、实验事件等表

-- ========================================
-- 1. A/B 测试实验事件表
-- ========================================
CREATE TABLE IF NOT EXISTS fitness_experiment_events (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    experiment_id   VARCHAR(100) NOT NULL,
    variant         VARCHAR(50) NOT NULL,  -- 'CONTROL' or 'TREATMENT'
    event_type      VARCHAR(100) NOT NULL, -- 'QUESTIONNAIRE_COMPLETED', 'TRIP_FEEDBACK', 'CALIBRATION'
    event_data      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_experiment_events_user ON fitness_experiment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_experiment_events_experiment ON fitness_experiment_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_events_variant ON fitness_experiment_events(experiment_id, variant);
CREATE INDEX IF NOT EXISTS idx_experiment_events_type ON fitness_experiment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_experiment_events_created ON fitness_experiment_events(created_at);

COMMENT ON TABLE fitness_experiment_events IS 'A/B 测试实验事件记录';
COMMENT ON COLUMN fitness_experiment_events.variant IS '实验组: CONTROL(对照组), TREATMENT(实验组)';
COMMENT ON COLUMN fitness_experiment_events.event_type IS '事件类型: QUESTIONNAIRE_COMPLETED, TRIP_FEEDBACK, CALIBRATION';

-- ========================================
-- 2. 可穿戴设备连接表
-- ========================================
CREATE TABLE IF NOT EXISTS wearable_connections (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    provider        VARCHAR(50) NOT NULL,  -- 'STRAVA', 'GARMIN', 'APPLE_HEALTH', 'GOOGLE_FIT'
    access_token    TEXT NOT NULL,
    refresh_token   TEXT,
    expires_at      TIMESTAMPTZ,
    scope           VARCHAR[] DEFAULT '{}',
    athlete_id      VARCHAR(100),          -- 外部平台的用户ID
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at    TIMESTAMPTZ,
    
    UNIQUE(user_id, provider)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wearable_conn_user ON wearable_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_conn_provider ON wearable_connections(provider);

COMMENT ON TABLE wearable_connections IS '可穿戴设备 OAuth 连接';
COMMENT ON COLUMN wearable_connections.provider IS '数据源: STRAVA, GARMIN, APPLE_HEALTH, GOOGLE_FIT';
COMMENT ON COLUMN wearable_connections.athlete_id IS '外部平台的用户ID（如 Strava athlete ID）';

-- ========================================
-- 3. 可穿戴设备活动数据表
-- ========================================
CREATE TABLE IF NOT EXISTS wearable_activities (
    id                      SERIAL PRIMARY KEY,
    user_id                 VARCHAR(255) NOT NULL,
    activity_id             VARCHAR(100) NOT NULL UNIQUE,  -- 内部唯一ID
    provider                VARCHAR(50) NOT NULL,
    external_id             VARCHAR(100) NOT NULL,         -- 外部平台的活动ID
    
    -- 基础信息
    name                    VARCHAR(500),
    activity_type           VARCHAR(50) NOT NULL,          -- 'HIKE', 'RUN', 'WALK', 'BIKE', 'OTHER'
    start_date              TIMESTAMPTZ NOT NULL,
    end_date                TIMESTAMPTZ,
    
    -- 核心指标
    distance_m              NUMERIC(12, 2),
    elevation_gain_m        NUMERIC(10, 2),
    elevation_loss_m        NUMERIC(10, 2),
    moving_time_seconds     INTEGER,
    elapsed_time_seconds    INTEGER,
    
    -- 可选指标
    avg_heart_rate          INTEGER,
    max_heart_rate          INTEGER,
    avg_pace                NUMERIC(6, 2),                 -- 分钟/公里
    calories                INTEGER,
    
    -- 高级数据
    start_lat               NUMERIC(10, 7),
    start_lng               NUMERIC(10, 7),
    end_lat                 NUMERIC(10, 7),
    end_lng                 NUMERIC(10, 7),
    polyline                TEXT,                          -- 编码的路线
    
    -- 元数据
    raw_data                JSONB,
    imported_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wearable_act_user ON wearable_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_act_provider ON wearable_activities(provider);
CREATE INDEX IF NOT EXISTS idx_wearable_act_type ON wearable_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_wearable_act_start ON wearable_activities(start_date);
CREATE INDEX IF NOT EXISTS idx_wearable_act_user_date ON wearable_activities(user_id, start_date DESC);

COMMENT ON TABLE wearable_activities IS '可穿戴设备活动数据（标准化格式）';
COMMENT ON COLUMN wearable_activities.activity_type IS '活动类型: HIKE, RUN, WALK, BIKE, OTHER';
COMMENT ON COLUMN wearable_activities.polyline IS 'Google Polyline 编码的路线';

-- ========================================
-- 4. 可穿戴设备体能评估表
-- ========================================
CREATE TABLE IF NOT EXISTS wearable_fitness_estimates (
    id                              SERIAL PRIMARY KEY,
    user_id                         VARCHAR(255) NOT NULL,
    provider                        VARCHAR(50) NOT NULL,
    estimated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 评估结果
    estimated_max_daily_ascent_m    INTEGER NOT NULL,
    estimated_rolling_ascent_3days_m INTEGER NOT NULL,
    confidence_score                NUMERIC(3, 2) NOT NULL,  -- 0.00-1.00
    
    -- 依据
    activity_count                  INTEGER NOT NULL,
    data_range_days                 INTEGER NOT NULL,
    
    -- 峰值表现
    max_single_day_ascent_m         INTEGER,
    max_single_day_distance_km      NUMERIC(6, 2),
    longest_moving_time_hours       NUMERIC(5, 2)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wearable_est_user ON wearable_fitness_estimates(user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_est_date ON wearable_fitness_estimates(estimated_at DESC);

COMMENT ON TABLE wearable_fitness_estimates IS '基于可穿戴数据的体能评估';

-- ========================================
-- 5. 体能趋势分析结果表（缓存）
-- ========================================
CREATE TABLE IF NOT EXISTS fitness_trend_cache (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    period_days     INTEGER NOT NULL,
    
    -- 趋势结果
    trend           VARCHAR(50) NOT NULL,   -- 'IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA'
    confidence      NUMERIC(3, 2),
    slope           NUMERIC(8, 6),
    data_points     INTEGER,
    
    -- 摘要
    summary         TEXT,
    summary_zh      TEXT,
    
    -- 时间
    analyzed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,   -- 缓存过期时间
    
    UNIQUE(user_id, period_days)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_trend_cache_user ON fitness_trend_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_trend_cache_expires ON fitness_trend_cache(expires_at);

COMMENT ON TABLE fitness_trend_cache IS '体能趋势分析结果缓存';

-- ========================================
-- 6. 体能异常记录表
-- ========================================
CREATE TABLE IF NOT EXISTS fitness_anomalies (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    anomaly_type    VARCHAR(100) NOT NULL,  -- 'SUDDEN_DECLINE', 'CONSISTENT_OVERLOAD', 'RATING_INCONSISTENCY', 'UNUSUAL_PATTERN'
    severity        VARCHAR(20) NOT NULL,   -- 'LOW', 'MEDIUM', 'HIGH'
    
    -- 描述
    description     TEXT,
    description_zh  TEXT,
    
    -- 关联数据
    related_trip_ids VARCHAR[],
    
    -- 状态
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    resolved_by     VARCHAR(50),            -- 'AUTO_CALIBRATION', 'USER_ACTION', 'MANUAL'
    
    -- 是否已通知用户
    notified        BOOLEAN DEFAULT false,
    notified_at     TIMESTAMPTZ
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_anomalies_user ON fitness_anomalies(user_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON fitness_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON fitness_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved ON fitness_anomalies(user_id) WHERE resolved_at IS NULL;

COMMENT ON TABLE fitness_anomalies IS '体能异常检测记录';
COMMENT ON COLUMN fitness_anomalies.anomaly_type IS '异常类型: SUDDEN_DECLINE(突然下降), CONSISTENT_OVERLOAD(持续超负荷), RATING_INCONSISTENCY(评分不一致), UNUSUAL_PATTERN(异常模式)';

-- ========================================
-- 7. 体能报告表
-- ========================================
CREATE TABLE IF NOT EXISTS fitness_reports (
    id                  SERIAL PRIMARY KEY,
    user_id             VARCHAR(255) NOT NULL,
    report_type         VARCHAR(50) NOT NULL DEFAULT 'PERIODIC',  -- 'PERIODIC', 'ON_DEMAND', 'MILESTONE'
    
    -- 报告周期
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    period_days         INTEGER NOT NULL,
    
    -- 基础统计
    total_trips         INTEGER,
    avg_fatigue_index   NUMERIC(4, 2),
    avg_effort_rating   NUMERIC(3, 2),
    completion_rate     NUMERIC(4, 3),
    
    -- 能力变化
    start_max_ascent_m  INTEGER,
    end_max_ascent_m    INTEGER,
    change_percent      NUMERIC(5, 2),
    calibration_count   INTEGER,
    
    -- 趋势
    trend               VARCHAR(50),
    trend_confidence    NUMERIC(3, 2),
    
    -- 异常
    anomaly_count       INTEGER DEFAULT 0,
    
    -- 建议
    recommendations     TEXT[],
    recommendations_zh  TEXT[],
    
    -- 完整报告（JSON）
    full_report         JSONB,
    
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_reports_user ON fitness_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated ON fitness_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_period ON fitness_reports(user_id, period_end DESC);

COMMENT ON TABLE fitness_reports IS '用户体能分析报告';

-- ========================================
-- 8. 更新 Phase 1 表（添加 processed 字段的默认值）
-- ========================================
-- 确保 trip_fitness_feedback 表有 processed 字段
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trip_fitness_feedback' AND column_name = 'processed'
    ) THEN
        ALTER TABLE trip_fitness_feedback ADD COLUMN processed BOOLEAN DEFAULT false;
        ALTER TABLE trip_fitness_feedback ADD COLUMN processed_at TIMESTAMPTZ;
    END IF;
END $$;

-- 添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_feedback_unprocessed ON trip_fitness_feedback(user_id) WHERE processed = false;

-- ========================================
-- 9. 视图：用户体能综合状态
-- ========================================
CREATE OR REPLACE VIEW v_user_fitness_status AS
SELECT 
    u.user_id,
    -- 最新问卷数据
    q.fitness_level,
    q.fitness_score,
    q.age_group,
    -- 最新快照数据
    s.max_daily_ascent_m,
    s.rolling_ascent_3days_m,
    s.confidence_level,
    s.completed_trip_count,
    -- 反馈统计
    COALESCE(f.total_feedbacks, 0) as total_feedbacks,
    COALESCE(f.avg_rating, 0) as avg_effort_rating,
    COALESCE(f.completion_rate, 0) as completion_rate,
    COALESCE(f.pending_feedbacks, 0) as pending_feedbacks,
    -- 最近校准
    c.last_calibrated_at,
    c.last_calibration_factor,
    -- 连接的设备
    w.connected_providers,
    w.last_sync_at as wearable_last_sync
FROM (
    SELECT DISTINCT user_id FROM fitness_questionnaire_answers
) u
LEFT JOIN LATERAL (
    SELECT fitness_level, fitness_score, age_group
    FROM fitness_questionnaire_answers
    WHERE user_id = u.user_id
    ORDER BY created_at DESC
    LIMIT 1
) q ON true
LEFT JOIN LATERAL (
    SELECT max_daily_ascent_m, rolling_ascent_3days_m, confidence_level, completed_trip_count
    FROM user_fitness_profile_snapshot
    WHERE user_id = u.user_id
    ORDER BY snapshot_at DESC
    LIMIT 1
) s ON true
LEFT JOIN LATERAL (
    SELECT 
        COUNT(*) as total_feedbacks,
        AVG(actual_effort_rating)::numeric as avg_rating,
        AVG(CASE WHEN completed_as_planned THEN 1.0 ELSE 0.0 END)::numeric as completion_rate,
        COUNT(*) FILTER (WHERE processed = false) as pending_feedbacks
    FROM trip_fitness_feedback
    WHERE user_id = u.user_id
) f ON true
LEFT JOIN LATERAL (
    SELECT calibrated_at as last_calibrated_at, calibration_factor as last_calibration_factor
    FROM fitness_calibration_history
    WHERE user_id = u.user_id
    ORDER BY calibrated_at DESC
    LIMIT 1
) c ON true
LEFT JOIN LATERAL (
    SELECT 
        ARRAY_AGG(DISTINCT provider) as connected_providers,
        MAX(last_sync_at) as last_sync_at
    FROM wearable_connections
    WHERE user_id = u.user_id
) w ON true;

COMMENT ON VIEW v_user_fitness_status IS '用户体能综合状态视图（整合问卷、快照、反馈、校准、设备数据）';

-- ========================================
-- 10. 函数：获取用户体能趋势（简化版）
-- ========================================
CREATE OR REPLACE FUNCTION get_user_fitness_trend(
    p_user_id VARCHAR,
    p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
    trend VARCHAR,
    avg_rating NUMERIC,
    data_points INTEGER,
    earliest_date TIMESTAMPTZ,
    latest_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN COUNT(*) < 3 THEN 'INSUFFICIENT_DATA'
            WHEN AVG(actual_effort_rating) > 2.3 THEN 'IMPROVING'
            WHEN AVG(actual_effort_rating) < 1.7 THEN 'DECLINING'
            ELSE 'STABLE'
        END::VARCHAR as trend,
        AVG(actual_effort_rating)::NUMERIC as avg_rating,
        COUNT(*)::INTEGER as data_points,
        MIN(feedback_at)::TIMESTAMPTZ as earliest_date,
        MAX(feedback_at)::TIMESTAMPTZ as latest_date
    FROM trip_fitness_feedback
    WHERE user_id = p_user_id
      AND feedback_at > NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_fitness_trend IS '获取用户体能趋势（简化版，基于评分均值）';

-- ========================================
-- 完成
-- ========================================
