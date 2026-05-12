-- CreateTable
CREATE TABLE "world_facts" (
    "id" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "predicate" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "severity" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "snapshotVersion" TEXT,
    "supersedesFactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "world_facts_factKey_idx" ON "world_facts"("factKey");

-- CreateIndex
CREATE INDEX "world_facts_subjectType_subjectId_idx" ON "world_facts"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "world_facts_predicate_idx" ON "world_facts"("predicate");

-- CreateIndex
CREATE INDEX "world_facts_snapshotVersion_idx" ON "world_facts"("snapshotVersion");

-- AddForeignKey
ALTER TABLE "world_facts" ADD CONSTRAINT "world_facts_supersedesFactId_fkey" FOREIGN KEY ("supersedesFactId") REFERENCES "world_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
