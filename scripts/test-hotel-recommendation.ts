// 测试酒店推荐功能
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testRecommendation() {
  console.log('🧪 测试酒店推荐功能...\n');

  const city = '洛阳市';
  const starRating = 3;

  // 测试查询逻辑
  const cityName = city.replace('市', '');
  const cityWithSuffix = city.endsWith('市') ? city : `${city}市`;

  console.log(`查询参数: 城市=${city}, 星级=${starRating}`);
  console.log(`城市名称处理: ${cityName}, ${cityWithSuffix}\n`);

  const hotels = await prisma.rawHotelData_Slim.findMany({
    where: {
      OR: [
        { city: { equals: city } },
        { city: { equals: cityWithSuffix } },
        { city: { equals: cityName } },
        { city: { contains: cityName } },
      ],
    },
    take: 20,
  });

  console.log(`✅ 查询到 ${hotels.length} 家酒店\n`);

  // 品牌星级映射
  const brandStarMap: Record<string, number> = {
    '汉庭': 3,
    '如家': 3,
    '锦江': 3,
    '桔子': 4,
    '全季': 4,
    '亚朵': 4,
  };

  // 筛选逻辑
  const filteredHotels = hotels
    .map((hotel) => {
      let inferredStar = 0;
      if (hotel.brand) {
        for (const [brand, star] of Object.entries(brandStarMap)) {
          if (hotel.brand.includes(brand)) {
            inferredStar = star;
            break;
          }
        }
      }

      return {
        hotel,
        inferredStar,
      };
    })
    .filter((item) => {
      if (item.inferredStar === 0) {
        return true;
      }
      return item.inferredStar === starRating;
    })
    .slice(0, 5)
    .map((item) => ({
      id: item.hotel.id,
      name: item.hotel.name || '未知酒店',
      brand: item.hotel.brand,
      address: item.hotel.address,
      district: item.hotel.district,
      lat: item.hotel.lat,
      lng: item.hotel.lng,
      phone: item.hotel.phone,
    }));

  console.log(`✅ 筛选后找到 ${filteredHotels.length} 家推荐酒店\n`);

  if (filteredHotels.length > 0) {
    console.log('推荐酒店列表:');
    filteredHotels.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.name} (品牌: ${h.brand})`);
    });
  } else {
    console.log('⚠️  未找到推荐酒店');
    console.log('\n品牌分布:');
    const brands = [...new Set(hotels.map(h => h.brand).filter(Boolean))];
    brands.forEach(b => {
      const count = hotels.filter(h => h.brand === b).length;
      console.log(`  - ${b}: ${count} 家`);
    });
  }

  await prisma.$disconnect();
}

testRecommendation().catch(console.error);
