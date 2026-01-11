-- 修复所有失败的 Prisma 迁移脚本
-- 使用方法：连接到目标数据库后执行此脚本

-- 1. 查看所有失败的迁移（finished_at IS NULL）
SELECT 
    migration_name,
    started_at,
    finished_at,
    rolled_back_at,
    logs
FROM "_prisma_migrations" 
WHERE finished_at IS NULL
ORDER BY started_at DESC;

-- 2. 标记所有失败的迁移为已回滚（通用修复）
-- 这会修复所有 finished_at 为 NULL 的记录
UPDATE "_prisma_migrations" 
SET 
    finished_at = NOW(), 
    rolled_back_at = NOW() 
WHERE finished_at IS NULL;

-- 3. 验证修复结果（应该返回 0 行）
SELECT 
    migration_name,
    started_at,
    finished_at,
    rolled_back_at
FROM "_prisma_migrations" 
WHERE finished_at IS NULL;

-- 4. 查看所有迁移记录（确认状态）
SELECT 
    migration_name,
    started_at,
    finished_at,
    rolled_back_at
FROM "_prisma_migrations" 
ORDER BY started_at DESC
LIMIT 10;
