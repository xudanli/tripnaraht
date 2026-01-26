-- 创建打包清单模板表
CREATE TABLE IF NOT EXISTS "packing_checklist_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" VARCHAR(50) NOT NULL,
  "last_updated" TIMESTAMP(3) NOT NULL,
  "template_data" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建打包指南表
CREATE TABLE IF NOT EXISTS "packing_guides" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" VARCHAR(50) NOT NULL,
  "last_updated" TIMESTAMP(3) NOT NULL,
  "guide_data" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS "packing_checklist_templates_version_idx" ON "packing_checklist_templates"("version");
CREATE INDEX IF NOT EXISTS "packing_checklist_templates_is_active_idx" ON "packing_checklist_templates"("is_active");
CREATE INDEX IF NOT EXISTS "packing_guides_version_idx" ON "packing_guides"("version");
CREATE INDEX IF NOT EXISTS "packing_guides_is_active_idx" ON "packing_guides"("is_active");
