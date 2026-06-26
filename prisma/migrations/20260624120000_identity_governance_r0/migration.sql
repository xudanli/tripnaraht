-- Identity governance R0 — account, verification, organization, publishing permission

CREATE TABLE IF NOT EXISTS "user_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "verification_type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
    "provider" VARCHAR(64),
    "evidence" JSONB,
    "verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_verifications_user_id_verification_type_key"
    ON "user_verifications"("user_id", "verification_type");
CREATE INDEX IF NOT EXISTS "user_verifications_user_id_status_idx"
    ON "user_verifications"("user_id", "status");

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(64),
    "display_name" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(300),
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "owner_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX IF NOT EXISTS "organizations_owner_id_idx" ON "organizations"("owner_id");
CREATE INDEX IF NOT EXISTS "organizations_verification_status_idx" ON "organizations"("verification_status");

CREATE TABLE IF NOT EXISTS "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(32) NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organization_id_user_id_key"
    ON "organization_members"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_members_user_id_status_idx"
    ON "organization_members"("user_id", "status");

CREATE TABLE IF NOT EXISTS "project_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_memberships_trip_id_user_id_key"
    ON "project_memberships"("trip_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_memberships_user_id_status_idx"
    ON "project_memberships"("user_id", "status");

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_scope" VARCHAR(32) NOT NULL,
    "account_id" UUID NOT NULL,
    "plan" VARCHAR(64) NOT NULL DEFAULT 'FREE',
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "entitlements" JSONB,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subscriptions_account_scope_account_id_status_idx"
    ON "subscriptions"("account_scope", "account_id", "status");

CREATE TABLE IF NOT EXISTS "publishing_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" UUID NOT NULL,
    "level" VARCHAR(32) NOT NULL DEFAULT 'PRIVATE_ONLY',
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "publishing_permissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "publishing_permissions_subject_type_subject_id_status_idx"
    ON "publishing_permissions"("subject_type", "subject_id", "status");

CREATE TABLE IF NOT EXISTS "identity_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(128) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source_ip" VARCHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identity_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "identity_audit_logs_target_type_target_id_idx"
    ON "identity_audit_logs"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "identity_audit_logs_actor_id_created_at_idx"
    ON "identity_audit_logs"("actor_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "user_account_contexts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "context_type" VARCHAR(32) NOT NULL,
    "context_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_account_contexts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_account_contexts_user_id_is_active_idx"
    ON "user_account_contexts"("user_id", "is_active");

ALTER TABLE "user_verifications"
    ADD CONSTRAINT "user_verifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_memberships"
    ADD CONSTRAINT "project_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_account_contexts"
    ADD CONSTRAINT "user_account_contexts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
