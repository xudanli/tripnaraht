-- 验证 PostGIS 扩展是否在正确的数据库中安装
-- 使用方法：连接到目标数据库后执行

-- 1. 显示当前连接的数据库
SELECT current_database() AS current_db;

-- 2. 检查 PostGIS 扩展是否已安装
SELECT 
    extname AS extension_name,
    extversion AS version
FROM pg_extension 
WHERE extname IN ('postgis', 'postgis_topology');

-- 3. 检查 PostGIS 版本（如果能查询到，说明扩展可用）
SELECT PostGIS_version() AS postgis_version;

-- 4. 检查 geography 类型是否可用
SELECT typname, typtype 
FROM pg_type 
WHERE typname = 'geography';

-- 5. 检查当前数据库中的所有扩展
SELECT extname, extversion 
FROM pg_extension 
ORDER BY extname;
