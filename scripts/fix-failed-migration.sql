-- 修复失败的 Prisma 迁移脚本
-- 使用方法：连接到目标数据库后执行此脚本

-- 1. 查看失败的迁移
SELECT 
    migration_name,
    started_at,
    finished_at,
    rolled_back_at
FROM "_prisma_migrations" 
WHERE finished_at IS NULL
ORDER BY started_at DESC;

-- 2. 标记失败的迁移为已回滚
-- 注意：请根据实际情况替换 migration_name
UPDATE "_prisma_migrations" 
SET 
    finished_at = NOW(), 
    rolled_back_at = NOW() 
WHERE migration_name = '20251225191251_add_route_directions' 
  AND finished_at IS NULL;

-- 3. 验证修复结果
SELECT 
    migration_name,
    started_at,
    finished_at,
    rolled_back_at
FROM "_prisma_migrations" 
WHERE migration_name = '20251225191251_add_route_directions';

-- 4. 检查是否有部分创建的对象需要清理
-- 注意：根据实际迁移内容调整表名
-- SELECT tablename FROM pg_tables 
-- WHERE schemaname = 'public' 
--   AND tablename LIKE '%route_directions%';

-- 如果需要删除部分创建的对象，取消下面的注释并执行
-- DROP TABLE IF EXISTS "RouteDirection" CASCADE;
