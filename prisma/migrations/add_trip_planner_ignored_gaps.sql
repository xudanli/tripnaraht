-- 规划助手忽略缺口表
-- 存储用户忽略的具体缺口记录

CREATE TABLE IF NOT EXISTS trip_planner_ignored_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trip_id VARCHAR(255),
  gap_id VARCHAR(255) NOT NULL,
  gap_type VARCHAR(50) NOT NULL,
  gap_pattern JSONB,
  ignored_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_user ON trip_planner_ignored_gaps(user_id);
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_trip ON trip_planner_ignored_gaps(trip_id);
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_gap_id ON trip_planner_ignored_gaps(gap_id);
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_gap_type ON trip_planner_ignored_gaps(gap_type);
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_user_trip ON trip_planner_ignored_gaps(user_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_ignored_gaps_expires_at ON trip_planner_ignored_gaps(expires_at) WHERE expires_at IS NOT NULL;

-- 唯一索引：每个用户+行程+缺口ID组合只能有一条忽略记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_ignored_gaps_unique_user_trip_gap 
  ON trip_planner_ignored_gaps(user_id, COALESCE(trip_id, ''), gap_id);

-- 注释
COMMENT ON TABLE trip_planner_ignored_gaps IS '规划助手忽略缺口表，存储用户忽略的具体缺口记录';
COMMENT ON COLUMN trip_planner_ignored_gaps.gap_id IS '缺口ID（原始缺口ID或聚合后的ID）';
COMMENT ON COLUMN trip_planner_ignored_gaps.gap_type IS '缺口类型';
COMMENT ON COLUMN trip_planner_ignored_gaps.gap_pattern IS '匹配模式，用于匹配相似缺口';
COMMENT ON COLUMN trip_planner_ignored_gaps.expires_at IS '过期时间，如果设置，过期后自动恢复显示';
