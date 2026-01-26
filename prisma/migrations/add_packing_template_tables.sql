-- 创建打包清单模板表
CREATE TABLE IF NOT EXISTS "PackingChecklistTemplate" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "version" TEXT NOT NULL,
  "lastUpdated" TIMESTAMP(3) NOT NULL,
  "templateData" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建打包指南表
CREATE TABLE IF NOT EXISTS "PackingGuide" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "version" TEXT NOT NULL,
  "lastUpdated" TIMESTAMP(3) NOT NULL,
  "guideData" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "PackingChecklistTemplate_version_idx" ON "PackingChecklistTemplate"("version");
CREATE INDEX IF NOT EXISTS "PackingChecklistTemplate_isActive_idx" ON "PackingChecklistTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "PackingGuide_version_idx" ON "PackingGuide"("version");
CREATE INDEX IF NOT EXISTS "PackingGuide_isActive_idx" ON "PackingGuide"("isActive");
