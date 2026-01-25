// scripts/check-blue-lagoon.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  // 检查是否有蓝湖相关内容
  const chunks = await prisma.$queryRawUnsafe<Array<{
    content: string;
    credibility_score: number;
    filename: string;
  }>>(`
    SELECT c.content, c.credibility_score, kf.filename
    FROM chunks c
    LEFT JOIN knowledge_files kf ON c.file_id = kf.id
    WHERE c.content ILIKE '%蓝湖%' OR c.content ILIKE '%blue lagoon%' OR c.keywords::text ILIKE '%蓝湖%'
    LIMIT 5
  `);
  
  console.log('找到', chunks.length, '个相关chunks');
  chunks.forEach((c) => {
    console.log('文件:', c.filename);
    console.log('内容片段:', c.content?.substring(0, 150));
    console.log('---');
  });
  
  // 检查所有chunks的内容类型
  const types = await prisma.$queryRawUnsafe<Array<{ type: string; count: bigint }>>(`
    SELECT type, COUNT(*) as count
    FROM chunks
    GROUP BY type
  `);
  
  console.log('\nChunk类型分布:');
  types.forEach((t) => console.log(`  ${t.type}: ${Number(t.count)}`));
  
  // 测试一个简单的向量检索
  console.log('\n测试向量检索...');
  const testChunks = await prisma.$queryRawUnsafe<Array<{
    content: string;
    similarity: number;
  }>>(`
    SELECT 
      content,
      1 - (embedding <=> (SELECT embedding FROM chunks LIMIT 1)) as similarity
    FROM chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> (SELECT embedding FROM chunks LIMIT 1)
    LIMIT 3
  `);
  
  console.log('找到', testChunks.length, '个chunks');
  testChunks.forEach((c) => {
    console.log(`相似度: ${c.similarity.toFixed(4)}, 内容: ${c.content.substring(0, 80)}...`);
  });
  
  await prisma.$disconnect();
}

check().catch(console.error);
