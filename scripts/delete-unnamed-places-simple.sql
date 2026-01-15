-- 简单版本：直接删除 nameCN 等于 'Unnamed place' 的 Place 数据
-- ⚠️ 警告：此操作会失败如果有外键约束，请先检查依赖关系

-- 查看要删除的记录数
SELECT COUNT(*) as count_to_delete
FROM "Place"
WHERE "nameCN" = 'Unnamed place';

-- 执行删除（取消注释以执行）
-- DELETE FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';

-- 验证删除结果
-- SELECT COUNT(*) as remaining_count
-- FROM "Place"
-- WHERE "nameCN" = 'Unnamed place';
