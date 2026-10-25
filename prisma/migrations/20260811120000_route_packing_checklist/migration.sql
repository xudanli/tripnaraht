-- Route template packing checklist (1:1 hard link to RouteTemplate)

CREATE TABLE "route_packing_checklists" (
    "id" UUID NOT NULL,
    "routeTemplateId" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "templateData" JSONB NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_packing_checklists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "route_packing_checklists_routeTemplateId_key"
    ON "route_packing_checklists"("routeTemplateId");

CREATE INDEX "route_packing_checklists_countryCode_isActive_idx"
    ON "route_packing_checklists"("countryCode", "isActive");

CREATE INDEX "route_packing_checklists_isActive_idx"
    ON "route_packing_checklists"("isActive");

ALTER TABLE "route_packing_checklists"
    ADD CONSTRAINT "route_packing_checklists_routeTemplateId_fkey"
    FOREIGN KEY ("routeTemplateId") REFERENCES "RouteTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
