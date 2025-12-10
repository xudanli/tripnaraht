// 验证火车站数据转换结果
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyConversion() {
  console.log('🔍 验证火车站数据转换结果...\n');

  try {
    // 1. 查看转换后的火车站统计
    const placeStats = await prisma.place.groupBy({
      by: ['category'],
      where: {
        category: 'TRANSIT_HUB',
      },
      _count: {
        id: true,
      },
    });

    const totalStations = placeStats[0]?._count.id || 0;

    const withCity = await prisma.place.count({
      where: {
        category: 'TRANSIT_HUB',
        cityId: { not: null },
      },
    });

    const withAddress = await prisma.place.count({
      where: {
        category: 'TRANSIT_HUB',
        address: { not: null },
      },
    });

    // 使用原始SQL查询地理位置（因为Prisma不支持PostGIS直接查询）
    const withLocationResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE category = 'TRANSIT_HUB'
        AND location IS NOT NULL
    `;
    const withLocation = Number(withLocationResult[0]?.count || 0);

    console.log('📊 转换后的 Place 数据统计:');
    console.log(`  - 总火车站数: ${totalStations}`);
    console.log(`  - 有城市信息: ${withCity} (${((withCity / totalStations) * 100).toFixed(1)}%)`);
    console.log(`  - 有地理位置: ${withLocation} (${((withLocation / totalStations) * 100).toFixed(1)}%)`);
    console.log(`  - 有地址信息: ${withAddress} (${((withAddress / totalStations) * 100).toFixed(1)}%)`);
    console.log('');

    // 2. 查看原始数据统计
    const rawTotal = await prisma.rawTrainStationData.count();
    const rawProcessed = await prisma.rawTrainStationData.count({
      where: { processed: true },
    });
    const rawPending = await prisma.rawTrainStationData.count({
      where: { processed: false },
    });
    const rawWithCoords = await prisma.rawTrainStationData.count({
      where: {
        wgs84Lng: { not: null },
        wgs84Lat: { not: null },
      },
    });

    console.log('📊 原始数据统计:');
    console.log(`  - 总记录数: ${rawTotal}`);
    console.log(`  - 已处理: ${rawProcessed} (${((rawProcessed / rawTotal) * 100).toFixed(1)}%)`);
    console.log(`  - 待处理: ${rawPending} (${((rawPending / rawTotal) * 100).toFixed(1)}%)`);
    console.log(`  - 有坐标信息: ${rawWithCoords} (${((rawWithCoords / rawTotal) * 100).toFixed(1)}%)`);
    console.log('');

    // 3. 查看示例数据
    const samplePlaces = await prisma.place.findMany({
      where: {
        category: 'TRANSIT_HUB',
      },
      include: {
        city: true,
      },
      take: 10,
      orderBy: {
        id: 'asc',
      },
    });

    console.log('📋 示例数据（前10条）:');
    samplePlaces.forEach((place, index) => {
      const metadata = place.metadata as any;
      console.log(`\n  ${index + 1}. ${place.name}`);
      console.log(`     地址: ${place.address || '无'}`);
      console.log(`     城市: ${place.city?.name || '无'}`);
      console.log(`     省份: ${metadata?.province || '无'}`);
      console.log(`     铁路局: ${metadata?.railwayBureau || '无'}`);
      console.log(`     性质: ${metadata?.nature || '无'}`);
    });
    console.log('');

    // 4. 按省份统计
    const provinceStats = await prisma.$queryRaw<Array<{ province: string; count: bigint }>>`
      SELECT 
        p.metadata->>'province' as province,
        COUNT(*) as count
      FROM "Place" p
      WHERE p.category = 'TRANSIT_HUB'
        AND p.metadata->>'province' IS NOT NULL
      GROUP BY p.metadata->>'province'
      ORDER BY count DESC
      LIMIT 10
    `;

    console.log('📊 按省份统计（前10名）:');
    provinceStats.forEach((stat, index) => {
      console.log(`  ${index + 1}. ${stat.province || '未知'}: ${Number(stat.count)} 个火车站`);
    });
    console.log('');

    // 5. 按城市统计
    const cityStats = await prisma.place.groupBy({
      by: ['cityId'],
      where: {
        category: 'TRANSIT_HUB',
        cityId: { not: null },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 10,
    });

    console.log('📊 按城市统计（前10名）:');
    for (let i = 0; i < cityStats.length; i++) {
      const stat = cityStats[i];
      if (stat.cityId) {
        const city = await prisma.city.findUnique({
          where: { id: stat.cityId },
        });
        console.log(`  ${i + 1}. ${city?.name || '未知'}: ${stat._count.id} 个火车站`);
      }
    }
    console.log('');

    // 6. 检查问题数据
    const withoutCity = await prisma.place.count({
      where: {
        category: 'TRANSIT_HUB',
        cityId: null,
      },
    });

    const withoutLocationResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Place"
      WHERE category = 'TRANSIT_HUB'
        AND location IS NULL
    `;
    const withoutLocation = Number(withoutLocationResult[0]?.count || 0);

    console.log('⚠️  问题数据:');
    console.log(`  - 没有城市信息: ${withoutCity} 条`);
    console.log(`  - 没有地理位置: ${withoutLocation} 条`);
    console.log('');

    console.log('✅ 验证完成！');
  } catch (error: any) {
    console.error('❌ 验证失败:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyConversion();
