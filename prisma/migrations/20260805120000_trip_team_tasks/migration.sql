-- Team Hub · Team Tasks (lightweight pre-trip assignment board)

CREATE TABLE "trip_team_tasks" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "assignee_member_id" TEXT,
    "assignee_name" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "due_label" TEXT,
    "system_image" VARCHAR(64),
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "source_ref_id" TEXT,
    "source_label_zh" TEXT,
    "created_by_member_id" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_team_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_team_tasks_trip_id_status_idx"
    ON "trip_team_tasks"("trip_id", "status");

CREATE INDEX "trip_team_tasks_trip_id_source_type_source_ref_id_idx"
    ON "trip_team_tasks"("trip_id", "source_type", "source_ref_id");

ALTER TABLE "trip_team_tasks"
    ADD CONSTRAINT "trip_team_tasks_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
