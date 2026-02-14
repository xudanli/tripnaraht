"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function setupTables() {
    var _a;
    try {
        console.log('🚀 开始创建知识库表...\n');
        console.log('1. 启用 pgvector 扩展...');
        try {
            await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
            console.log('   ✅ pgvector 扩展已启用\n');
        }
        catch (e) {
            if ((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) {
                console.log('   ⚠️  pgvector 扩展已存在\n');
            }
            else {
                throw e;
            }
        }
        console.log('2. 创建 knowledge_files 表...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS knowledge_files (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          filename VARCHAR(255) UNIQUE NOT NULL,
          filepath VARCHAR(500) NOT NULL,
          category VARCHAR(50) NOT NULL,
          version VARCHAR(20) NOT NULL,
          language VARCHAR(10) DEFAULT 'zh-CN',
          credibility_score FLOAT NOT NULL,
          data_sources TEXT[] DEFAULT '{}',
          last_updated TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
            console.log('   ✅ knowledge_files 表创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  knowledge_files 表可能已存在\n');
        }
        console.log('3. 创建 knowledge_files 索引...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_files_category ON knowledge_files(category)
      `);
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_knowledge_files_filename ON knowledge_files(filename)
      `);
            console.log('   ✅ 索引创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  索引可能已存在\n');
        }
        console.log('4. 创建 chunks 表...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chunk_id VARCHAR(255) UNIQUE NOT NULL,
          content TEXT NOT NULL,
          embedding vector(1536),
          type VARCHAR(50) NOT NULL,
          section VARCHAR(100),
          credibility_score FLOAT NOT NULL,
          keywords TEXT[] DEFAULT '{}',
          file_id UUID NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
          metadata JSONB,
          token_count INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
            console.log('   ✅ chunks 表创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  chunks 表可能已存在\n');
        }
        console.log('5. 创建 chunks 索引...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_chunks_type ON chunks(type)
      `);
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_chunks_credibility_score ON chunks(credibility_score)
      `);
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id)
      `);
            console.log('   ✅ chunks 索引创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  索引可能已存在\n');
        }
        console.log('6. 创建向量索引 (HNSW)...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
            console.log('   ✅ 向量索引创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  向量索引可能已存在或需要先有数据\n');
        }
        console.log('7. 创建 keyword_indices 表...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS keyword_indices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          keyword VARCHAR(100) UNIQUE NOT NULL,
          files TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
            console.log('   ✅ keyword_indices 表创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  keyword_indices 表可能已存在\n');
        }
        console.log('8. 创建 query_history 表...');
        try {
            await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS query_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          query TEXT NOT NULL,
          retrieved_chunks JSONB NOT NULL,
          answer TEXT,
          avg_credibility FLOAT,
          execution_time_ms INTEGER NOT NULL,
          user_id UUID,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
            await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at)
      `);
            console.log('   ✅ query_history 表创建成功\n');
        }
        catch (e) {
            console.log('   ⚠️  query_history 表可能已存在\n');
        }
        console.log('📊 验证表结构...');
        const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('knowledge_files', 'chunks', 'keyword_indices', 'query_history') ORDER BY tablename`);
        console.log('\n已创建的表:');
        tables.forEach((t) => {
            console.log(`  ✅ ${t.tablename}`);
        });
        if (tables.length === 4) {
            console.log('\n🎉 所有表创建成功！');
        }
        else {
            console.log(`\n⚠️  期望 4 个表，实际找到 ${tables.length} 个`);
        }
        console.log('\n✅ 迁移完成！');
    }
    catch (error) {
        console.error('\n❌ 迁移失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
setupTables()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=setup-knowledge-base-tables.js.map