-- Migration: Trip Lifecycle Runtime - Phase 1
-- Purpose: Migrate existing IN_PROGRESS trips to TRAVELING status
-- Date: 2025-06-15
-- Context: Trip Lifecycle Runtime implementation

-- Update all trips with IN_PROGRESS status to TRAVELING
-- This is part of the backward compatibility strategy for the new lifecycle states
UPDATE "Trip"
SET "status" = 'TRAVELING'
WHERE "status" = 'IN_PROGRESS';

-- Log the migration
-- Note: This is a one-time migration. After this, the application code
-- will handle the normalization via normalizeTripStatus() function.
