-- Migration: Add Fitness Assessment Tables
-- Description: 添加体能评估系统的数据库表结构（Phase 1 人体能力模型改进）
-- Date: 2026-02-11
-- Author: Phase 1 Expert Team Decision

-- ========== 体能问卷答案表 ==========
-- 存储用户的标准化体能问卷答案
CREATE TABLE IF NOT EXISTS fitness_questionnaire_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  
  -- 问卷答案（0-4 评分）
  weekly_exercise INTEGER NOT NULL CHECK (weekly_exercise >= 0 AND weekly_exercise <= 4),
  longest_hike INTEGER NOT NULL CHECK (longest_hike >= 0 AND longest_hike <= 4),
  elevation_experience INTEGER NOT NULL CHECK (elevation_experience >= 0 AND elevation_experience <= 4),
  
  -- 年龄段
  age_group VARCHAR(20) NOT NULL CHECK (age_group IN ('18-29', '30-39', '40-49', '50-59', '60+')),
  
  -- 计算的体能评分和等级
  fitness_score INTEGER CHECK (fitness_score >= 0 AND fitness_score <= 100),
  fitness_level VARCHAR(20) CHECK (fitness_level IN ('LOW', 'MEDIUM_LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH')),
  
  -- 年龄修正系数
  age_modifier DECIMAL(3, 2) CHECK (age_modifier >= 0.5 AND age_modifier <= 1.0),
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 每个用户只有一条最新的问卷记录
  CONSTRAINT fitness_questionnaire_answers_user_id_key UNIQUE (user_id)
);

-- 索引
CREATE INDEX idx_fitness_questionnaire_user_id ON fitness_questionnaire_answers(user_id);
CREATE INDEX idx_fitness_questionnaire_fitness_level ON fitness_questionnaire_answers(fitness_level);
CREATE INDEX idx_fitness_questionnaire_age_group ON fitness_questionnaire_answers(age_group);
CREATE INDEX idx_fitness_questionnaire_created_at ON fitness_questionnaire_answers(created_at DESC);

-- 注释
COMMENT ON TABLE fitness_questionnaire_answers IS '体能问卷答案表，存储用户的标准化体能评估问卷答案';
COMMENT ON COLUMN fitness_questionnaire_answers.user_id IS '用户ID（唯一标识）';
COMMENT ON COLUMN fitness_questionnaire_answers.weekly_exercise IS '每周运动习惯（0=基本不运动, 1=偶尔, 2=2-3次/周, 3=4次+/周, 4=专业级）';
COMMENT ON COLUMN fitness_questionnaire_answers.longest_hike IS '最长单日徒步距离（0=从未, 1=5km以内, 2=5-15km, 3=15-25km, 4=25km+）';
COMMENT ON COLUMN fitness_questionnaire_answers.elevation_experience IS '最大单日爬升经验（0=不确定, 1=300m以下, 2=300-600m, 3=600-1000m, 4=1000m+）';
COMMENT ON COLUMN fitness_questionnaire_answers.age_group IS '年龄段';
COMMENT ON COLUMN fitness_questionnaire_answers.fitness_score IS '计算的体能评分（0-100）';
COMMENT ON COLUMN fitness_questionnaire_answers.fitness_level IS '体能等级（LOW/MEDIUM_LOW/MEDIUM/MEDIUM_HIGH/HIGH）';
COMMENT ON COLUMN fitness_questionnaire_answers.age_modifier IS '年龄修正系数（0.6-1.0）';


-- ========== 行程体能反馈表 ==========
-- 存储用户行程后的体能反馈，用于校准模型
CREATE TABLE IF NOT EXISTS trip_fitness_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  
  -- 系统预估 vs 用户实际感受
  planned_fatigue_index DECIMAL(4, 2) NOT NULL,
  actual_effort_rating INTEGER NOT NULL CHECK (actual_effort_rating >= 1 AND actual_effort_rating <= 3),
  -- 1 = 😓 太累了（系统高估了用户能力）
  -- 2 = 😊 刚刚好（系统评估准确）
  -- 3 = 💪 还能再走（系统低估了用户能力）
  
  -- 行程完成情况
  completed_as_planned BOOLEAN NOT NULL DEFAULT true,
  adjustments_made JSONB DEFAULT '[]'::JSONB,
  
  -- 处理状态（用于校准）
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  
  -- 时间戳
  feedback_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 每个用户每个行程只有一条反馈
  CONSTRAINT trip_fitness_feedback_trip_user_key UNIQUE (trip_id, user_id)
);

-- 索引
CREATE INDEX idx_trip_fitness_feedback_trip_id ON trip_fitness_feedback(trip_id);
CREATE INDEX idx_trip_fitness_feedback_user_id ON trip_fitness_feedback(user_id);
CREATE INDEX idx_trip_fitness_feedback_actual_effort_rating ON trip_fitness_feedback(actual_effort_rating);
CREATE INDEX idx_trip_fitness_feedback_completed ON trip_fitness_feedback(completed_as_planned);
CREATE INDEX idx_trip_fitness_feedback_processed ON trip_fitness_feedback(processed);
CREATE INDEX idx_trip_fitness_feedback_feedback_at ON trip_fitness_feedback(feedback_at DESC);

-- 注释
COMMENT ON TABLE trip_fitness_feedback IS '行程体能反馈表，存储用户行程后的体能反馈，用于校准人体能力模型';
COMMENT ON COLUMN trip_fitness_feedback.trip_id IS '行程ID';
COMMENT ON COLUMN trip_fitness_feedback.user_id IS '用户ID';
COMMENT ON COLUMN trip_fitness_feedback.planned_fatigue_index IS '系统预估的疲劳指数';
COMMENT ON COLUMN trip_fitness_feedback.actual_effort_rating IS '用户实际感受（1=太累了, 2=刚刚好, 3=还能再走）';
COMMENT ON COLUMN trip_fitness_feedback.completed_as_planned IS '是否按计划完成';
COMMENT ON COLUMN trip_fitness_feedback.adjustments_made IS '实际做了哪些调整（JSON数组）';
COMMENT ON COLUMN trip_fitness_feedback.processed IS '是否已用于校准';
COMMENT ON COLUMN trip_fitness_feedback.processed_at IS '校准处理时间';


-- ========== 体能模型校准历史表 ==========
-- 记录每次模型校准的历史
CREATE TABLE IF NOT EXISTS fitness_calibration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  
  -- 校准前后的参数
  old_max_daily_ascent_m INTEGER NOT NULL,
  new_max_daily_ascent_m INTEGER NOT NULL,
  old_rolling_ascent_3days_m INTEGER NOT NULL,
  new_rolling_ascent_3days_m INTEGER NOT NULL,
  
  -- 校准因子和来源
  calibration_factor DECIMAL(4, 2) NOT NULL,
  calibration_source VARCHAR(50) NOT NULL CHECK (calibration_source IN ('QUESTIONNAIRE', 'HISTORICAL', 'WEARABLE', 'FIRST_DAY_TEST', 'USER_SELF_REPORT', 'DEFAULT')),
  
  -- 参与校准的反馈数量
  feedback_count INTEGER NOT NULL DEFAULT 0,
  
  -- 校准后的置信度
  confidence_level VARCHAR(20) CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH')),
  
  -- 时间戳
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_fitness_calibration_history_user_id ON fitness_calibration_history(user_id);
CREATE INDEX idx_fitness_calibration_history_source ON fitness_calibration_history(calibration_source);
CREATE INDEX idx_fitness_calibration_history_calibrated_at ON fitness_calibration_history(calibrated_at DESC);

-- 注释
COMMENT ON TABLE fitness_calibration_history IS '体能模型校准历史表，记录每次模型校准的参数变化';
COMMENT ON COLUMN fitness_calibration_history.user_id IS '用户ID';
COMMENT ON COLUMN fitness_calibration_history.old_max_daily_ascent_m IS '校准前的单日最大爬升（米）';
COMMENT ON COLUMN fitness_calibration_history.new_max_daily_ascent_m IS '校准后的单日最大爬升（米）';
COMMENT ON COLUMN fitness_calibration_history.old_rolling_ascent_3days_m IS '校准前的3日滚动爬升阈值（米）';
COMMENT ON COLUMN fitness_calibration_history.new_rolling_ascent_3days_m IS '校准后的3日滚动爬升阈值（米）';
COMMENT ON COLUMN fitness_calibration_history.calibration_factor IS '校准因子（如 0.9 表示降低10%）';
COMMENT ON COLUMN fitness_calibration_history.calibration_source IS '校准来源';
COMMENT ON COLUMN fitness_calibration_history.feedback_count IS '参与校准的反馈数量';
COMMENT ON COLUMN fitness_calibration_history.confidence_level IS '校准后的置信度等级';


-- ========== 用户体能画像快照表 ==========
-- 存储用户的体能画像快照，用于追踪变化
CREATE TABLE IF NOT EXISTS user_fitness_profile_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  
  -- 体能参数
  max_daily_ascent_m INTEGER NOT NULL,
  rolling_ascent_3days_m INTEGER NOT NULL,
  max_slope_pct INTEGER NOT NULL,
  
  -- 评分和等级
  fitness_score INTEGER CHECK (fitness_score >= 0 AND fitness_score <= 100),
  fitness_level VARCHAR(20) CHECK (fitness_level IN ('LOW', 'MEDIUM_LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH')),
  
  -- 置信度
  confidence_level VARCHAR(20) CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH')),
  assessment_source VARCHAR(50) CHECK (assessment_source IN ('QUESTIONNAIRE', 'HISTORICAL', 'WEARABLE', 'FIRST_DAY_TEST', 'USER_SELF_REPORT', 'DEFAULT')),
  
  -- 年龄信息
  age_group VARCHAR(20),
  age_modifier DECIMAL(3, 2),
  
  -- 行程统计
  completed_trip_count INTEGER DEFAULT 0,
  
  -- 时间戳
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_user_fitness_profile_snapshot_user_id ON user_fitness_profile_snapshot(user_id);
CREATE INDEX idx_user_fitness_profile_snapshot_fitness_level ON user_fitness_profile_snapshot(fitness_level);
CREATE INDEX idx_user_fitness_profile_snapshot_confidence ON user_fitness_profile_snapshot(confidence_level);
CREATE INDEX idx_user_fitness_profile_snapshot_snapshot_at ON user_fitness_profile_snapshot(snapshot_at DESC);

-- 注释
COMMENT ON TABLE user_fitness_profile_snapshot IS '用户体能画像快照表，用于追踪用户体能模型的变化';
COMMENT ON COLUMN user_fitness_profile_snapshot.user_id IS '用户ID';
COMMENT ON COLUMN user_fitness_profile_snapshot.max_daily_ascent_m IS '单日最大爬升（米）';
COMMENT ON COLUMN user_fitness_profile_snapshot.rolling_ascent_3days_m IS '3日滚动爬升阈值（米）';
COMMENT ON COLUMN user_fitness_profile_snapshot.max_slope_pct IS '最大可接受坡度（百分比）';
COMMENT ON COLUMN user_fitness_profile_snapshot.fitness_score IS '体能评分（0-100）';
COMMENT ON COLUMN user_fitness_profile_snapshot.fitness_level IS '体能等级';
COMMENT ON COLUMN user_fitness_profile_snapshot.confidence_level IS '置信度等级';
COMMENT ON COLUMN user_fitness_profile_snapshot.assessment_source IS '评估来源';
COMMENT ON COLUMN user_fitness_profile_snapshot.completed_trip_count IS '已完成行程数';


-- ========== 体能反馈统计视图 ==========
-- 用于快速查询用户的反馈统计
CREATE OR REPLACE VIEW v_user_fitness_feedback_stats AS
SELECT 
  user_id,
  COUNT(*) AS total_feedbacks,
  AVG(actual_effort_rating)::DECIMAL(3, 2) AS avg_effort_rating,
  AVG(CASE WHEN completed_as_planned THEN 1.0 ELSE 0.0 END)::DECIMAL(3, 2) AS completion_rate,
  SUM(CASE WHEN actual_effort_rating = 1 THEN 1 ELSE 0 END) AS too_hard_count,
  SUM(CASE WHEN actual_effort_rating = 2 THEN 1 ELSE 0 END) AS just_right_count,
  SUM(CASE WHEN actual_effort_rating = 3 THEN 1 ELSE 0 END) AS too_easy_count,
  MAX(feedback_at) AS last_feedback_at
FROM trip_fitness_feedback
GROUP BY user_id;

COMMENT ON VIEW v_user_fitness_feedback_stats IS '用户体能反馈统计视图';


-- ========== 触发器：更新 updated_at ==========
CREATE OR REPLACE FUNCTION update_fitness_questionnaire_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fitness_questionnaire_updated_at
  BEFORE UPDATE ON fitness_questionnaire_answers
  FOR EACH ROW
  EXECUTE FUNCTION update_fitness_questionnaire_updated_at();


-- ========== 完成提示 ==========
-- 迁移完成后，请确保以下内容：
-- 1. 在 FitnessAssessmentService 中使用这些表
-- 2. 定期清理过期的校准历史（保留最近 N 条）
-- 3. 监控反馈数据，确保校准算法正常工作
