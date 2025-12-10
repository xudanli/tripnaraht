-- Create RawTrainStationData table
-- This table stores raw train station data imported from CSV files

CREATE TABLE IF NOT EXISTS "RawTrainStationData" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  "railwayBureau" VARCHAR(255),
  category VARCHAR(255),
  nature VARCHAR(255),
  province VARCHAR(255),
  city VARCHAR(255),
  "wgs84Lng" DOUBLE PRECISION,
  "wgs84Lat" DOUBLE PRECISION,
  "importedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN NOT NULL DEFAULT false
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "RawTrainStationData_province_idx" ON "RawTrainStationData"(province);
CREATE INDEX IF NOT EXISTS "RawTrainStationData_city_idx" ON "RawTrainStationData"(city);
CREATE INDEX IF NOT EXISTS "RawTrainStationData_province_city_idx" ON "RawTrainStationData"(province, city);
CREATE INDEX IF NOT EXISTS "RawTrainStationData_railwayBureau_idx" ON "RawTrainStationData"("railwayBureau");
CREATE INDEX IF NOT EXISTS "RawTrainStationData_nature_idx" ON "RawTrainStationData"(nature);
CREATE INDEX IF NOT EXISTS "RawTrainStationData_processed_idx" ON "RawTrainStationData"(processed);
