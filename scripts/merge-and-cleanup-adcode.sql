-- 合并并清理 adcode 数据
-- 1. 将 adcode 值更新到对应的城市记录（通过 name + countryCode 匹配）
-- 2. 删除所有有 adcode 的重复记录

BEGIN;

-- 步骤1: 查看当前数据情况
DO $$
DECLARE
    total_cities INTEGER;
    cities_with_adcode INTEGER;
    cities_without_adcode INTEGER;
    duplicate_groups INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_cities FROM "City";
    SELECT COUNT(*) INTO cities_with_adcode FROM "City" WHERE adcode IS NOT NULL;
    SELECT COUNT(*) INTO cities_without_adcode FROM "City" WHERE adcode IS NULL;
    
    -- 统计有重复的城市组（name + countryCode 相同，但一个有 adcode，一个没有）
    SELECT COUNT(DISTINCT name || "countryCode") INTO duplicate_groups
    FROM "City"
    WHERE name || "countryCode" IN (
        SELECT name || "countryCode"
        FROM "City"
        GROUP BY name, "countryCode"
        HAVING COUNT(*) > 1
          AND COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) > 0
          AND COUNT(CASE WHEN adcode IS NULL THEN 1 END) > 0
    );
    
    RAISE NOTICE '当前数据统计:';
    RAISE NOTICE '  总城市数: %', total_cities;
    RAISE NOTICE '  有 adcode 的城市: %', cities_with_adcode;
    RAISE NOTICE '  无 adcode 的城市: %', cities_without_adcode;
    RAISE NOTICE '  需要合并的重复组: %', duplicate_groups;
END $$;

-- 步骤2: 将有 adcode 的记录的 adcode 值更新到对应的城市记录
-- 匹配规则：name + countryCode 相同，但目标记录没有 adcode
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE "City" AS target
    SET adcode = source.adcode
    FROM (
        SELECT 
            name,
            "countryCode",
            adcode
        FROM "City"
        WHERE adcode IS NOT NULL
    ) AS source
    WHERE target.name = source.name
      AND target."countryCode" = source."countryCode"
      AND target.adcode IS NULL
      AND source.adcode IS NOT NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE '已更新 % 条记录的 adcode 字段', updated_count;
END $$;

-- 步骤3: 删除所有有 adcode 的记录
-- 注意：这会删除所有 adcode 不为 NULL 的记录
-- 在执行前，adcode 值已经合并到对应的城市记录中了
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "City"
    WHERE adcode IS NOT NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '已删除 % 条有 adcode 的记录', deleted_count;
END $$;

-- 步骤4: 显示最终统计
DO $$
DECLARE
    final_total INTEGER;
    final_with_adcode INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_total FROM "City";
    SELECT COUNT(*) INTO final_with_adcode FROM "City" WHERE adcode IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '操作完成后的统计:';
    RAISE NOTICE '  总城市数: %', final_total;
    RAISE NOTICE '  有 adcode 的城市: %', final_with_adcode;
END $$;

-- 如果需要回滚，请执行: ROLLBACK;
-- 确认无误后执行: COMMIT;
COMMIT;

