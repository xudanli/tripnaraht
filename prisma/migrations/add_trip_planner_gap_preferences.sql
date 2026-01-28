-- 规划助手缺口偏好表
-- 存储用户对"待完善项"的显示偏好和忽略设置

CREATE TABLE IF NOT EXISTS trip_planner_gap_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trip_id VARCHAR(255),
  session_id VARCHAR(255),
  collapsed BOOLEAN DEFAULT false,
  show_only_critical BOOLEAN DEFAULT false,
  filter_types TEXT[],
  ignored_patterns JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_gap_preferences_user ON trip_planner_gap_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_gap_preferences_trip ON trip_planner_gap_preferences(trip_id);
CREATE INDEX IF NOT EXISTS idx_gap_preferences_session ON trip_planner_gap_preferences(session_id);
CREATE INDEX IF NOT EXISTS idx_gap_preferences_user_trip ON trip_planner_gap_preferences(user_id, trip_id);

-- 唯一索引：每个用户+行程+会话组合只能有一条偏好记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_gap_preferences_unique_user_trip_session 
  ON trip_planner_gap_preferences(user_id, COALESCE(trip_id, ''), COALESCE(session_id, ''));

-- 注释
COMMENT ON TABLE trip_planner_gap_preferences IS '规划助手缺口偏好表，存储用户对"待完善项"的显示偏好和忽略设置';
COMMENT ON COLUMN trip_planner_gap_preferences.collapsed IS '是否收起缺口列表';
COMMENT ON COLUMN trip_planner_gap_preferences.show_only_critical IS '是否只显示CRITICAL级别的缺口';
COMMENT ON COLUMN trip_planner_gap_preferences.filter_types IS '过滤的类型数组，空数组表示显示所有类型';
COMMENT ON COLUMN trip_planner_gap_preferences.ignored_patterns IS '忽略的缺口模式，JSONB格式';
