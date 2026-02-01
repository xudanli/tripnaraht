-- 创建目的地澄清配置表
CREATE TABLE IF NOT EXISTS destination_clarification_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_code VARCHAR(2) UNIQUE NOT NULL,
    destination_name VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    config JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_destination_code ON destination_clarification_configs(destination_code);
CREATE INDEX IF NOT EXISTS idx_destination_clarification_configs_enabled ON destination_clarification_configs(enabled);

-- 添加注释
COMMENT ON TABLE destination_clarification_configs IS '目的地特化澄清配置表';
COMMENT ON COLUMN destination_clarification_configs.destination_code IS '目的地代码（ISO 3166-1 alpha-2）';
COMMENT ON COLUMN destination_clarification_configs.config IS '完整的 DestinationClarificationConfig JSON 配置';
