-- Agent AI chat conversations (TRIP_SHARED | PERSONAL) + message ledger

DO $$ BEGIN
  CREATE TYPE "AgentConversationScope" AS ENUM ('TRIP_SHARED', 'PERSONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentConversationMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope "AgentConversationScope" NOT NULL,
  trip_id TEXT REFERENCES "Trip"(id) ON DELETE CASCADE,
  title VARCHAR(200),
  created_by_user_id TEXT NOT NULL,
  visibility JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ(6),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS agent_conversations_created_by_user_id_scope_updated_at_idx
  ON agent_conversations (created_by_user_id, scope, updated_at);

CREATE INDEX IF NOT EXISTS agent_conversations_trip_id_scope_idx
  ON agent_conversations (trip_id, scope);

-- One TRIP_SHARED primary thread per trip
CREATE UNIQUE INDEX IF NOT EXISTS agent_conversations_trip_shared_unique
  ON agent_conversations (trip_id)
  WHERE scope = 'TRIP_SHARED' AND trip_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role "AgentConversationMessageRole" NOT NULL,
  user_id TEXT,
  display_name VARCHAR(120),
  content TEXT NOT NULL,
  request_id VARCHAR(128),
  result_status VARCHAR(64),
  delivery_verdict VARCHAR(64),
  task_id VARCHAR(128),
  summary_json JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_conversation_messages_conversation_id_created_at_idx
  ON agent_conversation_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS agent_conversation_messages_request_id_idx
  ON agent_conversation_messages (request_id);
