// 验证向量化是否完成
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  try {
    console.log('🔍 验证向量化状态...\n');

    // 查询总数
    const total = await prisma.chunk.count();
    console.log(`📊 总 Chunks 数: ${total}`);

    // 查询未向量化的数量
    const needEmbedding = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE embedding IS NULL
         OR embedding = (SELECT array_fill(0::real, ARRAY[1536]))::vector
    `;

    const needCount = Number(needEmbedding[0]?.count || 0);
    const hasEmbedding = total - needCount;

    console.log(`✅ 已向量化: ${hasEmbedding} (${((hasEmbedding / total) * 100).toFixed(1)}%)`);
    console.log(`⏳ 待向量化: ${needCount} (${((needCount / total) * 100).toFixed(1)}%)`);

    if (needCount === 0) {
      console.log('\n🎉 所有 chunks 已完成向量化！');
    } else {
      console.log(`\n⚠️  还有 ${needCount} 个 chunks 需要向量化`);
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
    process.exit(1);
  }
}

verify();
