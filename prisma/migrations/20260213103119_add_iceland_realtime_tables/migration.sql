-- CreateTable: RoadStatusRealtime
-- F-road 实时状态存储表，用于冰岛高地道路状态跟踪
CREATE TABLE "road_status_realtime" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "road_id" VARCHAR(10) NOT NULL,
    "road_name" VARCHAR(255),
    "current_status" VARCHAR(20) NOT NULL,
    "status_message" TEXT,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "data_source" VARCHAR(50) NOT NULL,
    "api_response" JSONB,
    "hazards" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "seasonal_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "road_status_realtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WeatherForecastRealtime
-- 冰岛天气预报存储表，支持区域查询和时间范围查询
CREATE TABLE "weather_forecast_realtime" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "region_key" VARCHAR(50) NOT NULL,
    "region_name" VARCHAR(255) NOT NULL,
    "location" geography(POINT, 4326),
    "forecast_time" TIMESTAMPTZ(6) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "temperature" DOUBLE PRECISION,
    "wind_speed" DOUBLE PRECISION,
    "wind_direction" INTEGER,
    "precipitation" DOUBLE PRECISION,
    "visibility" DOUBLE PRECISION,
    "conditions" VARCHAR(100),
    "weather_code" VARCHAR(20),
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "hazards" JSONB NOT NULL DEFAULT '[]',
    "data_source" VARCHAR(50) NOT NULL,
    "api_response" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "weather_forecast_realtime_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Place
-- 添加数据新鲜度跟踪字段
ALTER TABLE "Place" ADD COLUMN "last_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "Place" ADD COLUMN "data_source" VARCHAR(50);
ALTER TABLE "Place" ADD COLUMN "data_freshness" VARCHAR(20);

-- CreateIndex: RoadStatusRealtime
CREATE INDEX "road_status_realtime_road_id_idx" ON "road_status_realtime"("road_id");
CREATE INDEX "road_status_realtime_current_status_idx" ON "road_status_realtime"("current_status");
CREATE INDEX "road_status_realtime_last_verified_at_idx" ON "road_status_realtime"("last_verified_at" DESC);
CREATE INDEX "idx_road_status_road_verified" ON "road_status_realtime"("road_id", "last_verified_at" DESC);
CREATE INDEX "road_status_realtime_data_source_idx" ON "road_status_realtime"("data_source");

-- CreateIndex: WeatherForecastRealtime
CREATE INDEX "weather_forecast_realtime_region_key_idx" ON "weather_forecast_realtime"("region_key");
CREATE INDEX "weather_forecast_realtime_forecast_time_idx" ON "weather_forecast_realtime"("forecast_time");
CREATE INDEX "idx_weather_valid_range" ON "weather_forecast_realtime"("valid_from", "valid_until");
CREATE INDEX "weather_forecast_realtime_region_key_forecast_time_idx" ON "weather_forecast_realtime"("region_key", "forecast_time");
CREATE INDEX "weather_forecast_realtime_location_idx" ON "weather_forecast_realtime" USING GIST("location");
CREATE INDEX "weather_forecast_realtime_data_source_idx" ON "weather_forecast_realtime"("data_source");

-- CreateIndex: Place
CREATE INDEX "Place_last_verified_at_idx" ON "Place"("last_verified_at");
CREATE INDEX "Place_data_freshness_idx" ON "Place"("data_freshness");
