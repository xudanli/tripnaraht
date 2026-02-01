-- Migration: Add debug_info column to decision_drafts table
-- Description: 添加 debug_info 字段以支持 Studio 模式的调试信息

-- 添加 debug_info 字段（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'decision_drafts' 
        AND column_name = 'debug_info'
    ) THEN
        ALTER TABLE decision_drafts 
        ADD COLUMN debug_info JSONB;
        
        RAISE NOTICE 'Column debug_info added to decision_drafts';
    ELSE
        RAISE NOTICE 'Column debug_info already exists in decision_drafts';
    END IF;
END $$;
