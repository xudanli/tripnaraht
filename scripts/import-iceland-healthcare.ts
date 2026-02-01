#!/usr/bin/env tsx
/**
 * 导入冰岛医院和医疗设施POI数据到Place表
 * 数据源：用户提供的冰岛医疗设施JSON数据
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface HealthcareData {
  metadata: {
    version: string;
    last_updated: string;
    data_sources: string[];
    credibility_score: number;
    language: string;
    description: string;
    critical_importance: string;
    total_hospitals: number;
    total_clinics: number;
    total_pharmacies: number;
  };
  major_hospitals?: Array<{
    id: number;
    uuid?: string;
    hospitalNameCN: string;
    hospitalNameEN: string;
    category: string;
    location: {
      type: string;
      coordinates: [number, number];
    };
    address: string;
    phoneNumber?: string;
    emergency_phone?: string;
    website?: string;
    cityId?: number;
    cityName: string;
    rating?: number;
    review_count?: number;
    description: string;
    description_en?: string;
    hospital_type?: string;
    bed_count?: number;
    departments?: string[];
    emergency_department?: Record<string, any>;
    language_support?: Record<string, any>;
    visitor_information?: Record<string, any>;
    user_reviews_summary?: Record<string, any>;
    decision_relevance?: Record<string, any>;
    route_relevance?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
  }>;
  private_clinics?: Array<{
    id: number;
    uuid?: string;
    clinicNameCN: string;
    clinicNameEN: string;
    category: string;
    location: {
      type: string;
      coordinates: [number, number];
    };
    address: string;
    phoneNumber?: string;
    website?: string;
    description?: string;
    description_en?: string;
    opening_hours?: Record<string, string>;
    services?: string[];
    cost?: string;
    rating?: number;
    advantages?: string[];
    disadvantages?: string[];
    best_for?: string[];
    createdAt?: string;
    updatedAt?: string;
  }>;
  pharmacies?: Array<{
    id: number;
    uuid?: string;
    pharmacyNameCN: string;
    pharmacyNameEN: string;
    category: string;
    description?: string;
    total_locations?: number;
    main_locations?: Array<{
      name: string;
      address: string;
      coordinates: [number, number];
      hours?: string;
      parking?: string;
    }>;
    services?: string[];
    payment?: string;
    rating?: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

// 将医疗设施类别映射到 PlaceCategory
function mapCategoryToPlaceCategory(category: string, type: 'hospital' | 'clinic' | 'pharmacy'): PlaceCategory {
  if (type === 'pharmacy') {
    return PlaceCategory.SHOPPING; // 药店归类为购物
  }
  return PlaceCategory.HOSPITAL; // 医院和诊所归类为医院
}

// 解析营业时间
function parseOpeningHours(openingHours?: Record<string, string>): any {
  if (!openingHours) return undefined;

  const converted: any = {};
  
  // 映射常见格式
  if (openingHours.monday_friday) {
    converted.mon = openingHours.monday_friday;
    converted.tue = openingHours.monday_friday;
    converted.wed = openingHours.monday_friday;
    converted.thu = openingHours.monday_friday;
    converted.fri = openingHours.monday_friday;
  }
  if (openingHours.saturday) {
    converted.sat = openingHours.saturday;
  }
  if (openingHours.sunday) {
    converted.sun = openingHours.sunday === 'CLOSED' ? 'Closed' : openingHours.sunday;
  }

  return Object.keys(converted).length > 0 ? converted : undefined;
}

// 构建医院/诊所的 metadata
function buildHospitalMetadata(
  facility: HealthcareData['major_hospitals'][0] | HealthcareData['private_clinics'][0],
  type: 'hospital' | 'clinic'
): any {
  const metadata: any = {
    // 设施类型
    facility_type: type,
    category: facility.category,
    
    // 联系方式
    contact: {
      phone: facility.phoneNumber,
      website: facility.website,
      ...(type === 'hospital' && (facility as any).emergency_phone ? {
        emergency_phone: (facility as any).emergency_phone,
      } : {}),
    },
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      type.toUpperCase(),
      facility.category,
      ...((facility as any).departments || []),
      ...((facility as any).services || []),
    ],
    
    // 医院特定信息
    ...(type === 'hospital' ? {
      hospital_type: (facility as any).hospital_type,
      bed_count: (facility as any).bed_count,
      departments: (facility as any).departments,
      emergency_department: (facility as any).emergency_department,
      language_support: (facility as any).language_support,
      visitor_information: (facility as any).visitor_information,
    } : {}),
    
    // 诊所特定信息
    ...(type === 'clinic' ? {
      services: (facility as any).services,
      cost: (facility as any).cost,
      opening_hours: parseOpeningHours((facility as any).opening_hours),
    } : {}),
    
    // 用户评价摘要
    ...((facility as any).user_reviews_summary ? {
      user_reviews: {
        avg_rating: (facility as any).user_reviews_summary.avg_rating,
        total_reviews: (facility as any).user_reviews_summary.total_reviews,
        pros: (facility as any).user_reviews_summary.pros,
        cons: (facility as any).user_reviews_summary.cons,
      },
    } : {}),
    
    // 决策相关性
    ...((facility as any).decision_relevance ? {
      decision_relevance: (facility as any).decision_relevance,
    } : {}),
    
    // 路线相关性
    ...((facility as any).route_relevance ? {
      route_relevance: (facility as any).route_relevance,
    } : {}),
    
    // 优势劣势（诊所）
    ...(type === 'clinic' ? {
      advantages: (facility as any).advantages,
      disadvantages: (facility as any).disadvantages,
      best_for: (facility as any).best_for,
    } : {}),
    
    // 数据来源信息
    data_source: 'Iceland Healthcare Database',
    last_updated: facility.updatedAt || new Date().toISOString(),
  };

  return metadata;
}

// 构建药店的 metadata
function buildPharmacyMetadata(
  pharmacy: HealthcareData['pharmacies'][0],
  location?: HealthcareData['pharmacies'][0]['main_locations'][0]
): any {
  const metadata: any = {
    // 药店信息
    pharmacy_name_cn: pharmacy.pharmacyNameCN,
    pharmacy_name_en: pharmacy.pharmacyNameEN,
    pharmacy_id: pharmacy.id,
    category: pharmacy.category,
    
    // 营业状态
    business_status: 'OPERATIONAL',
    
    // 标签
    rawTags: [
      'PHARMACY',
      'MEDICAL',
      pharmacy.category,
      ...(pharmacy.services || []),
    ],
    
    // 服务
    services: pharmacy.services,
    
    // 支付方式
    payment_methods: pharmacy.payment ? pharmacy.payment.split(', ') : undefined,
    
    // 位置特定信息
    ...(location ? {
      location_name: location.name,
      opening_hours: location.hours ? { text: location.hours } : undefined,
      parking: location.parking,
    } : {}),
    
    // 数据来源信息
    data_source: 'Iceland Healthcare Database',
    last_updated: pharmacy.updatedAt || new Date().toISOString(),
  };

  return metadata;
}

// 查找或创建城市
async function findOrCreateCity(cityName: string, countryCode: string = 'IS'): Promise<number> {
  // 常见城市名映射
  const cityMap: Record<string, string> = {
    'Reykjavik': 'Reykjavik',
    'Reykjavík': 'Reykjavik',
    'Akureyri': 'Akureyri',
    'Egilsstadir': 'Egilsstadir',
    'Höfn': 'Hofn',
    'Hofn': 'Hofn',
  };

  const cityNameToSearch = cityMap[cityName] || cityName;

  let city = await prisma.city.findFirst({
    where: {
      OR: [
        { nameEN: cityNameToSearch },
        { nameCN: cityNameToSearch },
      ],
      countryCode: countryCode,
    },
  });

  if (!city) {
    // 创建城市
    const cityNameCN: Record<string, string> = {
      'Reykjavik': '雷克雅未克',
      'Akureyri': '阿克雷里',
      'Egilsstadir': '埃吉尔斯塔滇',
      'Hofn': '霍夫',
    };

    city = await prisma.city.create({
      data: {
        name: cityNameToSearch,
        nameEN: cityNameToSearch,
        nameCN: cityNameCN[cityNameToSearch] || cityNameToSearch,
        countryCode: countryCode,
        timezone: 'Atlantic/Reykjavik',
      },
    });
    console.log(`  ✅ 创建城市: ${city.nameCN} (ID: ${city.id})`);
  }

  return city.id;
}

async function main() {
  console.log('='.repeat(60));
  console.log('导入冰岛医院和医疗设施POI数据到Place表');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 读取数据文件
    const dataPath = process.argv[2] || path.join(process.cwd(), 'data/iceland-healthcare.json');
    console.log(`📖 读取数据文件: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`文件不存在: ${dataPath}`);
    }

    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const healthcareData: HealthcareData = JSON.parse(rawData);

    let totalFacilities = 0;
    if (healthcareData.major_hospitals) totalFacilities += healthcareData.major_hospitals.length;
    if (healthcareData.private_clinics) totalFacilities += healthcareData.private_clinics.length;
    if (healthcareData.pharmacies) {
      // 药店可能有多个位置
      healthcareData.pharmacies.forEach(p => {
        if (p.main_locations) {
          totalFacilities += p.main_locations.length;
        } else {
          totalFacilities += 1;
        }
      });
    }

    console.log(`  找到 ${totalFacilities} 个医疗设施\n`);

    // 2. 导入医疗设施
    console.log('📍 开始导入医疗设施...');
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // 导入医院
    if (healthcareData.major_hospitals) {
      for (const hospital of healthcareData.major_hospitals) {
        try {
          const [lng, lat] = hospital.location.coordinates;
          if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
            console.log(`  ⚠️  跳过: ${hospital.hospitalNameCN} (无效坐标)`);
            skipped++;
            continue;
          }

          const cityId = await findOrCreateCity(hospital.cityName);

          const existingPlace = await prisma.place.findFirst({
            where: {
              OR: [
                { nameCN: hospital.hospitalNameCN },
                { nameEN: hospital.hospitalNameEN },
              ],
              cityId: cityId,
              category: PlaceCategory.HOSPITAL,
            },
          });

          const placeData = {
            uuid: uuidv4(), // 始终生成新的UUID，避免冲突
            nameCN: hospital.hospitalNameCN,
            nameEN: hospital.hospitalNameEN,
            category: mapCategoryToPlaceCategory(hospital.category, 'hospital'),
            address: hospital.address,
            cityId: cityId,
            googlePlaceId: null,
            rating: hospital.rating || null,
            description: hospital.description_en || hospital.description,
            metadata: buildHospitalMetadata(hospital, 'hospital') as any,
            updatedAt: new Date(),
          };

          if (existingPlace) {
            await prisma.$executeRaw`
              UPDATE "Place"
              SET 
                "nameCN" = ${placeData.nameCN},
                "nameEN" = ${placeData.nameEN},
                "category" = ${placeData.category}::"PlaceCategory",
                "address" = ${placeData.address},
                "cityId" = ${placeData.cityId},
                "rating" = ${placeData.rating},
                "description" = ${placeData.description},
                "metadata" = ${JSON.stringify(placeData.metadata)}::jsonb,
                "updatedAt" = ${placeData.updatedAt},
                "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              WHERE "id" = ${existingPlace.id}
            `;
            updated++;
            console.log(`  ✅ 更新: ${hospital.hospitalNameCN}`);
          } else {
            const newPlace = await prisma.place.create({
              data: placeData as any,
            });

            await prisma.$executeRaw`
              UPDATE "Place"
              SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              WHERE "id" = ${newPlace.id}
            `;
            imported++;
            console.log(`  ✅ 创建: ${hospital.hospitalNameCN}`);
          }
        } catch (error: any) {
          errors++;
          console.error(`  ❌ 错误: ${hospital.hospitalNameCN} - ${error.message}`);
        }
      }
    }

    // 导入诊所
    if (healthcareData.private_clinics) {
      for (const clinic of healthcareData.private_clinics) {
        try {
          const [lng, lat] = clinic.location.coordinates;
          if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
            console.log(`  ⚠️  跳过: ${clinic.clinicNameCN} (无效坐标)`);
            skipped++;
            continue;
          }

          const cityName = clinic.address.includes('Reykjavik') ? 'Reykjavik' : 'Reykjavik';
          const cityId = await findOrCreateCity(cityName);

          const existingPlace = await prisma.place.findFirst({
            where: {
              OR: [
                { nameCN: clinic.clinicNameCN },
                { nameEN: clinic.clinicNameEN },
              ],
              cityId: cityId,
              category: PlaceCategory.HOSPITAL,
            },
          });

          const placeData = {
            uuid: uuidv4(), // 始终生成新的UUID，避免冲突
            nameCN: clinic.clinicNameCN,
            nameEN: clinic.clinicNameEN,
            category: mapCategoryToPlaceCategory(clinic.category, 'clinic'),
            address: clinic.address,
            cityId: cityId,
            googlePlaceId: null,
            rating: clinic.rating || null,
            description: clinic.description || '',
            metadata: buildHospitalMetadata(clinic, 'clinic') as any,
            updatedAt: new Date(),
          };

          if (existingPlace) {
            await prisma.$executeRaw`
              UPDATE "Place"
              SET 
                "nameCN" = ${placeData.nameCN},
                "nameEN" = ${placeData.nameEN},
                "category" = ${placeData.category}::"PlaceCategory",
                "address" = ${placeData.address},
                "cityId" = ${placeData.cityId},
                "rating" = ${placeData.rating},
                "description" = ${placeData.description},
                "metadata" = ${JSON.stringify(placeData.metadata)}::jsonb,
                "updatedAt" = ${placeData.updatedAt},
                "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              WHERE "id" = ${existingPlace.id}
            `;
            updated++;
            console.log(`  ✅ 更新: ${clinic.clinicNameCN}`);
          } else {
            const newPlace = await prisma.place.create({
              data: placeData as any,
            });

            await prisma.$executeRaw`
              UPDATE "Place"
              SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              WHERE "id" = ${newPlace.id}
            `;
            imported++;
            console.log(`  ✅ 创建: ${clinic.clinicNameCN}`);
          }
        } catch (error: any) {
          errors++;
          console.error(`  ❌ 错误: ${clinic.clinicNameCN} - ${error.message}`);
        }
      }
    }

    // 导入药店
    if (healthcareData.pharmacies) {
      for (const pharmacy of healthcareData.pharmacies) {
        if (pharmacy.main_locations && pharmacy.main_locations.length > 0) {
          // 导入每个分店位置
          for (const location of pharmacy.main_locations) {
            try {
              const [lng, lat] = location.coordinates;
              if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
                console.log(`  ⚠️  跳过: ${location.name} (无效坐标)`);
                skipped++;
                continue;
              }

              const cityName = location.address.includes('Reykjavik') ? 'Reykjavik' :
                               location.address.includes('Akureyri') ? 'Akureyri' : 'Reykjavik';
              const cityId = await findOrCreateCity(cityName);

              const existingPlace = await prisma.place.findFirst({
                where: {
                  OR: [
                    { nameCN: location.name },
                    { nameEN: location.name },
                  ],
                  cityId: cityId,
                  category: PlaceCategory.SHOPPING,
                },
              });

              const placeData = {
                uuid: uuidv4(),
                nameCN: location.name,
                nameEN: location.name,
                category: mapCategoryToPlaceCategory(pharmacy.category, 'pharmacy'),
                address: location.address,
                cityId: cityId,
                googlePlaceId: null,
                rating: pharmacy.rating || null,
                description: pharmacy.description || '',
                metadata: buildPharmacyMetadata(pharmacy, location) as any,
                updatedAt: new Date(),
              };

              if (existingPlace) {
                await prisma.$executeRaw`
                  UPDATE "Place"
                  SET 
                    "nameCN" = ${placeData.nameCN},
                    "nameEN" = ${placeData.nameEN},
                    "category" = ${placeData.category}::"PlaceCategory",
                    "address" = ${placeData.address},
                    "cityId" = ${placeData.cityId},
                    "rating" = ${placeData.rating},
                    "description" = ${placeData.description},
                    "metadata" = ${JSON.stringify(placeData.metadata)}::jsonb,
                    "updatedAt" = ${placeData.updatedAt},
                    "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                  WHERE "id" = ${existingPlace.id}
                `;
                updated++;
                console.log(`  ✅ 更新: ${location.name}`);
              } else {
                const newPlace = await prisma.place.create({
                  data: placeData as any,
                });

                await prisma.$executeRaw`
                  UPDATE "Place"
                  SET "location" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                  WHERE "id" = ${newPlace.id}
                `;
                imported++;
                console.log(`  ✅ 创建: ${location.name}`);
              }
            } catch (error: any) {
              errors++;
              console.error(`  ❌ 错误: ${location.name} - ${error.message}`);
            }
          }
        } else {
          // 如果没有具体位置，使用药店链信息
          console.log(`  ⚠️  跳过: ${pharmacy.pharmacyNameCN} (无具体位置)`);
          skipped++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('导入完成');
    console.log('='.repeat(60));
    console.log(`✅ 创建: ${imported}`);
    console.log(`🔄 更新: ${updated}`);
    console.log(`⏭️  跳过: ${skipped}`);
    console.log(`❌ 错误: ${errors}`);
    console.log(`📊 总计: ${imported + updated + skipped + errors}`);
  } catch (error: any) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
