-- Team Tasks P1: remind log + personal packing checklist

CREATE TABLE "trip_team_task_reminds" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "from_member_id" TEXT NOT NULL,
    "to_member_id" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_team_task_reminds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_team_task_reminds_trip_id_to_member_id_created_at_idx"
    ON "trip_team_task_reminds"("trip_id", "to_member_id", "created_at");

ALTER TABLE "trip_team_task_reminds"
    ADD CONSTRAINT "trip_team_task_reminds_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "trip_my_packing_list_items" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title_zh" TEXT NOT NULL,
    "category_zh" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "source_type" VARCHAR(32),
    "source_ref_id" TEXT,
    "template_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_my_packing_list_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trip_my_packing_list_items_trip_id_user_id_idx"
    ON "trip_my_packing_list_items"("trip_id", "user_id");

CREATE INDEX "trip_my_packing_list_items_trip_id_user_id_source_type_source_ref_id_idx"
    ON "trip_my_packing_list_items"("trip_id", "user_id", "source_type", "source_ref_id");

ALTER TABLE "trip_my_packing_list_items"
    ADD CONSTRAINT "trip_my_packing_list_items_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
