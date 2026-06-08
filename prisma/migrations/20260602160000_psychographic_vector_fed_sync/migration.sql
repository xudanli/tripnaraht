-- PRD FED sync: psychographic_vector on user_profiles + Trip, HNSW on SSOT table

ALTER TABLE "UserProfile"
  ADD COLUMN IF NOT EXISTS "psychographic_vector" vector(12);

ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "psychographic_vector" vector(12);

CREATE INDEX IF NOT EXISTS user_psychographic_vectors_embedding_hnsw_idx
  ON user_psychographic_vectors
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS user_profile_psychographic_vector_hnsw_idx
  ON "UserProfile"
  USING hnsw (psychographic_vector vector_cosine_ops)
  WHERE psychographic_vector IS NOT NULL;
