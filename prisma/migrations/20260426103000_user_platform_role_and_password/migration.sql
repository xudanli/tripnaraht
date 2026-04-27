-- Staff console: platform role + optional bcrypt password on users

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_role" VARCHAR(32) NOT NULL DEFAULT 'USER';

CREATE INDEX IF NOT EXISTS "users_platform_role_idx" ON "users"("platform_role");
