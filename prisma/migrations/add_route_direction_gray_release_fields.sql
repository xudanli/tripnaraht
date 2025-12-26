-- 添加 RouteDirection 灰度与开关字段
-- 用于支持灰度发布、版本控制和受众过滤

-- 添加 status 字段（draft | active | deprecated）
ALTER TABLE "RouteDirection" 
  ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'active';

-- 添加 version 字段
ALTER TABLE "RouteDirection" 
  ADD COLUMN IF NOT EXISTS "version" TEXT;

-- 添加 rolloutPercent 字段（灰度百分比，0-100）
ALTER TABLE "RouteDirection" 
  ADD COLUMN IF NOT EXISTS "rolloutPercent" INTEGER DEFAULT 100;

-- 添加 audienceFilter 字段（受众过滤，JSONB）
ALTER TABLE "RouteDirection" 
  ADD COLUMN IF NOT EXISTS "audienceFilter" JSONB;

-- 创建索引
CREATE INDEX IF NOT EXISTS route_direction_status_idx ON "RouteDirection" (status);
CREATE INDEX IF NOT EXISTS route_direction_status_active_idx ON "RouteDirection" (status, isActive) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS route_direction_audience_filter_gin_idx ON "RouteDirection" USING GIN (audienceFilter);

-- 更新现有记录的 status（基于 isActive）
UPDATE "RouteDirection" 
  SET "status" = CASE 
    WHEN "isActive" = true THEN 'active'
    ELSE 'deprecated'
  END
  WHERE "status" IS NULL;

-- 添加注释
COMMENT ON COLUMN "RouteDirection"."status" IS '路线方向状态：draft（草稿）、active（激活）、deprecated（已废弃）';
COMMENT ON COLUMN "RouteDirection"."version" IS '版本号（如 "1.0.0"），用于版本控制和回滚';
COMMENT ON COLUMN "RouteDirection"."rolloutPercent" IS '灰度百分比（0-100），用于控制新版本的发布比例';
COMMENT ON COLUMN "RouteDirection"."audienceFilter" IS '受众过滤（JSONB），如 {"persona": ["photography"], "locale": ["zh-CN"]}';

