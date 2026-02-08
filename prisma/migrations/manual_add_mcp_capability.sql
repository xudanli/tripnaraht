-- Migration: Add MCP Capability Management Table
-- Created: 2026-02-08
-- Description: Add mcp_capabilities table for managing MCP service capabilities

-- Create table
CREATE TABLE IF NOT EXISTS mcp_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  tools JSONB DEFAULT '[]'::jsonb,
  category VARCHAR(50),
  auth_required BOOLEAN DEFAULT false,
  default_enabled BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_service_name ON mcp_capabilities(service_name);
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_enabled ON mcp_capabilities(enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_category ON mcp_capabilities(category);

-- Insert default capabilities (all enabled by default)
INSERT INTO mcp_capabilities (service_name, display_name, description, enabled, tools, category, auth_required, default_enabled)
VALUES
  ('google_maps', 'Google Maps', 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能', true, '["google_maps.searchPlaces", "google_maps.geocode", "google_maps.getRoute", "google_maps.computeDistanceMatrix"]'::jsonb, 'mapping', false, true),
  ('weather', 'Weather', '天气服务，提供当前天气和天气预报', true, '["weather.getCurrentWeather", "weather.getWeatherByDatetimeRange", "weather.getCurrentDateTime"]'::jsonb, 'weather', false, true),
  ('postgresql', 'PostgreSQL', 'PostgreSQL 数据库查询服务', true, '["postgresql.query", "postgresql.execute"]'::jsonb, 'database', false, true),
  ('airbnb', 'Airbnb', 'Airbnb 房源搜索服务', true, '["airbnb.search", "airbnb.listingDetails"]'::jsonb, 'accommodation', true, true),
  ('rail', 'Rail', '铁路查询服务', true, '["rail.searchRoutes", "rail.getRouteDetails"]'::jsonb, 'transportation', true, true),
  ('file_extractor', 'File Extractor', '文件内容提取服务', true, '["file_extractor.extract_file_content"]'::jsonb, 'utility', false, true),
  ('stripe', 'Stripe', 'Stripe 支付服务', true, '["stripe.createPaymentIntent", "stripe.confirmPaymentIntent", "stripe.getPaymentIntent", "stripe.refundPayment"]'::jsonb, 'payment', true, true),
  ('browserbase', 'Browserbase', 'Browserbase 浏览器自动化服务', true, '["browserbase.createSession", "browserbase.navigate", "browserbase.screenshot", "browserbase.click", "browserbase.evaluate"]'::jsonb, 'automation', true, true),
  ('currency', 'Currency Exchange', '货币汇率转换服务', true, '["currency.getLatestRates", "currency.convert", "currency.getRateTrend"]'::jsonb, 'finance', false, true),
  ('hotel', 'Hotel', '酒店搜索服务', true, '["hotel.search", "hotel.getDetails"]'::jsonb, 'accommodation', false, true),
  ('restaurant', 'Restaurant', '餐厅搜索服务', true, '["restaurant.search", "restaurant.nearby"]'::jsonb, 'dining', false, true),
  ('translation', 'Translation', '翻译服务', true, '["translation.translate", "translation.detectLanguage"]'::jsonb, 'utility', false, true),
  ('image', 'Image Search', '图片搜索服务', true, '["image.search", "image.recommend"]'::jsonb, 'media', false, true),
  ('vision', 'Vision Service', '视觉识别服务，提供 OCR 和 POI 识别', true, '["vision.poiRecommend", "ocr.extractText"]'::jsonb, 'vision', false, true)
ON CONFLICT (service_name) DO NOTHING;
