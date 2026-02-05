-- AddColumn: Trip.name
-- 为 Trip 表添加 name 字段（行程名称）
-- 字段类型：VARCHAR(200)，可选（nullable）

-- 1. 添加 name 字段
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "name" VARCHAR(200);

-- 2. 为已有行程生成默认名称
-- 格式：{目的地名称} {开始日期}
-- 例如：冰岛 2025-06-01
UPDATE "Trip"
SET "name" = CONCAT(
  CASE 
    WHEN "destination" = 'CN' THEN '中国'
    WHEN "destination" = 'JP' THEN '日本'
    WHEN "destination" = 'KR' THEN '韩国'
    WHEN "destination" = 'TH' THEN '泰国'
    WHEN "destination" = 'VN' THEN '越南'
    WHEN "destination" = 'SG' THEN '新加坡'
    WHEN "destination" = 'MY' THEN '马来西亚'
    WHEN "destination" = 'ID' THEN '印度尼西亚'
    WHEN "destination" = 'PH' THEN '菲律宾'
    WHEN "destination" = 'US' THEN '美国'
    WHEN "destination" = 'CA' THEN '加拿大'
    WHEN "destination" = 'AU' THEN '澳大利亚'
    WHEN "destination" = 'NZ' THEN '新西兰'
    WHEN "destination" = 'GB' THEN '英国'
    WHEN "destination" = 'FR' THEN '法国'
    WHEN "destination" = 'DE' THEN '德国'
    WHEN "destination" = 'IT' THEN '意大利'
    WHEN "destination" = 'ES' THEN '西班牙'
    WHEN "destination" = 'IS' THEN '冰岛'
    WHEN "destination" = 'NO' THEN '挪威'
    WHEN "destination" = 'SE' THEN '瑞典'
    WHEN "destination" = 'FI' THEN '芬兰'
    WHEN "destination" = 'DK' THEN '丹麦'
    WHEN "destination" = 'CH' THEN '瑞士'
    WHEN "destination" = 'AT' THEN '奥地利'
    WHEN "destination" = 'NL' THEN '荷兰'
    WHEN "destination" = 'BE' THEN '比利时'
    WHEN "destination" = 'PT' THEN '葡萄牙'
    WHEN "destination" = 'GR' THEN '希腊'
    WHEN "destination" = 'TR' THEN '土耳其'
    WHEN "destination" = 'AE' THEN '阿联酋'
    WHEN "destination" = 'EG' THEN '埃及'
    WHEN "destination" = 'ZA' THEN '南非'
    WHEN "destination" = 'BR' THEN '巴西'
    WHEN "destination" = 'AR' THEN '阿根廷'
    WHEN "destination" = 'MX' THEN '墨西哥'
    WHEN "destination" = 'IN' THEN '印度'
    WHEN "destination" = 'RU' THEN '俄罗斯'
    WHEN "destination" = 'NP' THEN '尼泊尔'
    WHEN "destination" = 'XZ' THEN '西藏'
    WHEN "destination" = 'LF' THEN '罗弗敦'
    WHEN "destination" = 'K2' THEN 'K2'
    WHEN "destination" = 'SJ' THEN '斯瓦尔巴'
    WHEN "destination" = 'GL' THEN '格陵兰'
    WHEN "destination" = 'AL' THEN '阿尔卑斯'
    ELSE UPPER("destination")
  END,
  ' ',
  TO_CHAR("startDate", 'YYYY-MM-DD')
)
WHERE "name" IS NULL;

-- 3. 添加注释
COMMENT ON COLUMN "Trip"."name" IS '行程名称（可选，最大长度 200 字符）。如果未提供，系统将自动生成默认名称：{目的地名称} {开始日期}';
