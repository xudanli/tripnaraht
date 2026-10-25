-- Route template budget estimate (1:1 hard link; per-day breakdown)

CREATE TABLE "route_budget_estimates" (
    "id" UUID NOT NULL,
    "routeTemplateId" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "partySize" INTEGER NOT NULL DEFAULT 2,
    "vehicleType" TEXT,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assumptions" TEXT,
    "dayBudgets" JSONB NOT NULL,
    "categoryTotals" JSONB,
    "totals" JSONB NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_budget_estimates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "route_budget_estimates_routeTemplateId_key"
    ON "route_budget_estimates"("routeTemplateId");

CREATE INDEX "route_budget_estimates_countryCode_isActive_idx"
    ON "route_budget_estimates"("countryCode", "isActive");

CREATE INDEX "route_budget_estimates_currency_isActive_idx"
    ON "route_budget_estimates"("currency", "isActive");

CREATE INDEX "route_budget_estimates_isActive_idx"
    ON "route_budget_estimates"("isActive");

ALTER TABLE "route_budget_estimates"
    ADD CONSTRAINT "route_budget_estimates_routeTemplateId_fkey"
    FOREIGN KEY ("routeTemplateId") REFERENCES "RouteTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
