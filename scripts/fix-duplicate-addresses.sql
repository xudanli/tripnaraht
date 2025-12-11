-- 修复地址字段中的重复问题
-- 例如：河北省唐山市迁安市迁安市 -> 河北省唐山市迁安市

-- 修复重复的区县名（在市级之后）
UPDATE "RawAttractionData"
SET address = REGEXP_REPLACE(
  address,
  '([^市]+市)([^市区县]+[市区县])\2',
  '\1\2',
  'g'
)
WHERE address ~ '([^市]+市)([^市区县]+[市区县])\2';

-- 修复重复的城市名
UPDATE "RawAttractionData"
SET address = REGEXP_REPLACE(
  address,
  '([^省]+省)([^市]+市)\2',
  '\1\2',
  'g'
)
WHERE address ~ '([^省]+省)([^市]+市)\2';

-- 验证修复结果
SELECT 
  COUNT(*) as total_with_duplicates
FROM "RawAttractionData"
WHERE address ~ '([^市]+市)([^市区县]+[市区县])\2'
   OR address ~ '([^省]+省)([^市]+市)\2';
