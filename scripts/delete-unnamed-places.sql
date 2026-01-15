-- 删除 nameCN 等于 'Unnamed place' 的 Place 数据
-- 注意：此脚本会检查外键约束，确保安全删除

-- ============================================
-- 第一步：检查要删除的数据量
-- ============================================
SELECT 
    COUNT(*) as total_count,
    COUNT(DISTINCT id) as unique_ids
FROM "Place"
WHERE "nameCN" = 'Unnamed place';

-- ============================================
-- 第二步：检查外键依赖关系
-- ============================================

-- 检查 ItineraryItem 表中的引用
SELECT 
    COUNT(*) as itinerary_item_count,
    COUNT(DISTINCT "placeId") as affected_places
FROM "ItineraryItem"
WHERE "placeId" IN (
    SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
);

-- 检查 Trail 表中的引用（startPlaceId 和 endPlaceId）
SELECT 
    COUNT(*) as trail_count,
    COUNT(DISTINCT "startPlaceId") as start_place_count,
    COUNT(DISTINCT "endPlaceId") as end_place_count
FROM "Trail"
WHERE "startPlaceId" IN (
    SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
)
OR "endPlaceId" IN (
    SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
);

-- 检查 TrailWaypoint 表中的引用
SELECT 
    COUNT(*) as trail_waypoint_count,
    COUNT(DISTINCT "placeId") as affected_places
FROM "TrailWaypoint"
WHERE "placeId" IN (
    SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
);

-- ============================================
-- 第三步：查看要删除的 Place 详细信息（可选）
-- ============================================
SELECT 
    id,
    uuid,
    "nameCN",
    "nameEN",
    category,
    "cityId",
    "createdAt"
FROM "Place"
WHERE "nameCN" = 'Unnamed place'
ORDER BY id
LIMIT 100;

-- ============================================
-- 第四步：执行删除操作
-- ============================================
-- 注意：根据外键约束，需要先删除依赖项，或者使用 CASCADE
-- 
-- 方案1：级联删除（如果外键设置了 ON DELETE CASCADE）
-- 此方案会同时删除相关的 ItineraryItem、Trail、TrailWaypoint 记录
-- ⚠️ 警告：此操作不可逆，请谨慎使用！

-- BEGIN;
-- 
-- DELETE FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';
-- 
-- COMMIT;

-- ============================================
-- 方案2：先删除依赖项，再删除 Place（推荐）
-- ============================================
-- 此方案更安全，可以控制删除顺序

-- BEGIN;
-- 
-- -- 1. 删除 TrailWaypoint 中的引用
-- DELETE FROM "TrailWaypoint"
-- WHERE "placeId" IN (
--     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- );
-- 
-- -- 2. 更新 Trail 表中的引用为 NULL（或删除相关 Trail）
-- -- 选项A：将引用设为 NULL
-- UPDATE "Trail"
-- SET "startPlaceId" = NULL
-- WHERE "startPlaceId" IN (
--     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- );
-- 
-- UPDATE "Trail"
-- SET "endPlaceId" = NULL
-- WHERE "endPlaceId" IN (
--     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- );
-- 
-- -- 选项B：删除相关 Trail（如果不需要保留）
-- -- DELETE FROM "Trail"
-- -- WHERE "startPlaceId" IN (
-- --     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- -- )
-- -- OR "endPlaceId" IN (
-- --     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- -- );
-- 
-- -- 3. 更新 ItineraryItem 表中的引用为 NULL（或删除相关 ItineraryItem）
-- -- 选项A：将引用设为 NULL
-- UPDATE "ItineraryItem"
-- SET "placeId" = NULL
-- WHERE "placeId" IN (
--     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- );
-- 
-- -- 选项B：删除相关 ItineraryItem（如果不需要保留）
-- -- DELETE FROM "ItineraryItem"
-- -- WHERE "placeId" IN (
-- --     SELECT id FROM "Place" WHERE "nameCN" = 'Unnamed place'
-- -- );
-- 
-- -- 4. 最后删除 Place 记录
-- DELETE FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';
-- 
-- COMMIT;

-- ============================================
-- 方案3：简单删除（如果确认没有外键约束或已处理）
-- ============================================
-- 如果确认要删除的 Place 记录没有被其他表引用，可以直接删除

-- DELETE FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';

-- ============================================
-- 验证删除结果
-- ============================================
-- SELECT COUNT(*) as remaining_count
-- FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';
