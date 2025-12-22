-- Migration: Add altitude_hint column to poi_canonical table
-- Created: 2025-01-15
-- Purpose: Support Xizang (Tibet) POI data with altitude information

-- Add altitude_hint column if it doesn't exist
ALTER TABLE poi_canonical 
  ADD COLUMN IF NOT EXISTS altitude_hint INTEGER;

-- Add comment
COMMENT ON COLUMN poi_canonical.altitude_hint IS '海拔提示（米），从 OSM ele 字段提取，用于高海拔地区（如西藏）的旅行准备度检查';

-- Create index for altitude queries (optional, useful for filtering by altitude)
CREATE INDEX IF NOT EXISTS poi_canonical_altitude_hint_idx 
  ON poi_canonical (altitude_hint) 
  WHERE altitude_hint IS NOT NULL;

