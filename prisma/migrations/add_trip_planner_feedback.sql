-- 规划助手问答反馈表
CREATE TABLE IF NOT EXISTS trip_planner_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  trip_id VARCHAR(255), -- Trip.id 是 String 类型
  user_id UUID,
  
  -- 反馈内容
  question TEXT,
  answer TEXT,
  helpful BOOLEAN NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  action_taken VARCHAR(255),
  
  -- 元数据
  source VARCHAR(50), -- 'RAG' | 'RAG+LLM' | 'LLM'
  rag_confidence FLOAT,
  processing_time_ms INTEGER,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT fk_trip FOREIGN KEY (trip_id) REFERENCES "Trip"(id) ON DELETE SET NULL
);

CREATE INDEX idx_trip_planner_feedback_question_id ON trip_planner_feedback(question_id);
CREATE INDEX idx_trip_planner_feedback_session_id ON trip_planner_feedback(session_id);
CREATE INDEX idx_trip_planner_feedback_trip_id ON trip_planner_feedback(trip_id);
CREATE INDEX idx_trip_planner_feedback_user_id ON trip_planner_feedback(user_id);
CREATE INDEX idx_trip_planner_feedback_helpful ON trip_planner_feedback(helpful);
CREATE INDEX idx_trip_planner_feedback_rating ON trip_planner_feedback(rating);
CREATE INDEX idx_trip_planner_feedback_created_at ON trip_planner_feedback(created_at);

COMMENT ON TABLE trip_planner_feedback IS '规划助手问答反馈表，用于收集用户对回答质量的反馈';
COMMENT ON COLUMN trip_planner_feedback.question_id IS '问题ID（会话消息ID）';
COMMENT ON COLUMN trip_planner_feedback.helpful IS '是否有用';
COMMENT ON COLUMN trip_planner_feedback.rating IS '评分（1-5）';
COMMENT ON COLUMN trip_planner_feedback.source IS '回答来源（RAG/RAG+LLM/LLM）';
COMMENT ON COLUMN trip_planner_feedback.rag_confidence IS 'RAG 置信度';
