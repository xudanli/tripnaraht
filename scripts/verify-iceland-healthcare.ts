#!/usr/bin/env tsx
/**
 * 验证冰岛医疗设施POI数据导入结果
 */

import { PrismaClient, PlaceCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(60));
  console.log('验证冰岛医疗设施POI数据导入结果');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 查找所有冰岛医疗设施（HOSPITAL类别）
    const hospitals = await prisma.place.findMany({
      where: {
        category: PlaceCategory.HOSPITAL,
        City: {
          countryCode: 'IS',
        },
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 2. 查找所有药店（SHOPPING类别，且名称包含pharmacy或药店）
    const pharmacies = await prisma.place.findMany({
      where: {
        category: PlaceCategory.SHOPPING,
        City: {
          countryCode: 'IS',
        },
        OR: [
          { nameCN: { contains: '药店' } },
          { nameCN: { contains: 'Pharmacy' } },
          { nameEN: { contains: 'Pharmacy' } },
          { nameEN: { contains: 'Lyfjastofan' } },
        ],
      },
      include: {
        City: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 找到 ${hospitals.length} 个医院/诊所`);
    console.log(`📊 找到 ${pharmacies.length} 个药店\n`);

    // 3. 验证每个医疗设施的数据完整性
    let validHospitals = 0;
    let invalidHospitals = 0;
    const hospitalIssues: Array<{ name: string; issues: string[] }> = [];

    for (const hospital of hospitals) {
      const issues: string[] = [];

      if (!hospital.nameCN) issues.push('缺少中文名称');
      if (!hospital.nameEN) issues.push('缺少英文名称');
      if (!hospital.address) issues.push('缺少地址');

      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${hospital.id}
      `;
      
      if (locationQuery.length === 0 || !locationQuery[0].lng || !locationQuery[0].lat) {
        issues.push('缺少坐标');
      }

      const metadata = hospital.metadata as any;
      if (!metadata) {
        issues.push('缺少元数据');
      } else {
        if (!metadata.facility_type) issues.push('缺少设施类型');
        if (metadata.facility_type === 'hospital' && !metadata.emergency_department) {
          issues.push('缺少急诊部门信息');
        }
      }

      if (issues.length > 0) {
        invalidHospitals++;
        hospitalIssues.push({ name: hospital.nameCN, issues });
      } else {
        validHospitals++;
      }
    }

    // 4. 显示验证结果
    console.log('📋 验证结果：');
    console.log(`  ✅ 有效医院/诊所: ${validHospitals}`);
    console.log(`  ❌ 无效医院/诊所: ${invalidHospitals}`);
    console.log(`  ✅ 药店: ${pharmacies.length}\n`);

    // 5. 显示医院详细信息
    console.log('🏥 医院/诊所详细信息：\n');
    for (let i = 0; i < hospitals.length; i++) {
      const h = hospitals[i];
      const metadata = h.metadata as any;

      const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
        SELECT 
          ST_X(location::geometry) as lng,
          ST_Y(location::geometry) as lat
        FROM "Place"
        WHERE id = ${h.id}
      `;
      const location = locationQuery.length > 0 ? locationQuery[0] : null;

      console.log(`${i + 1}. ${h.nameCN} (${h.nameEN})`);
      console.log(`   ID: ${h.id}`);
      console.log(`   城市: ${h.City?.nameCN || h.City?.nameEN || '未知'}`);
      console.log(`   地址: ${h.address || '无'}`);
      console.log(`   评分: ${h.rating || '无'}`);
      console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
      
      if (metadata) {
        console.log(`   设施类型: ${metadata.facility_type || '无'}`);
        console.log(`   类别: ${metadata.category || '无'}`);
        
        if (metadata.facility_type === 'hospital') {
          console.log(`   医院类型: ${metadata.hospital_type || '无'}`);
          console.log(`   床位: ${metadata.bed_count || '无'}`);
          if (metadata.emergency_department) {
            console.log(`   急诊: ${metadata.emergency_department.available || '无'}`);
            console.log(`   创伤中心: ${metadata.emergency_department.trauma_center || '无'}`);
          }
          if (metadata.departments) {
            console.log(`   科室: ${metadata.departments.slice(0, 3).join(', ')}${metadata.departments.length > 3 ? '...' : ''}`);
          }
        } else if (metadata.facility_type === 'clinic') {
          console.log(`   服务: ${metadata.services ? metadata.services.join(', ') : '无'}`);
          console.log(`   费用: ${metadata.cost || '无'}`);
        }
        
        if (metadata.contact?.emergency_phone) {
          console.log(`   紧急电话: ${metadata.contact.emergency_phone}`);
        }
        if (metadata.contact?.phone) {
          console.log(`   电话: ${metadata.contact.phone}`);
        }
      }

      console.log('');
    }

    // 6. 显示药店信息
    if (pharmacies.length > 0) {
      console.log('💊 药店详细信息：\n');
      for (let i = 0; i < pharmacies.length; i++) {
        const p = pharmacies[i];
        const metadata = p.metadata as any;

        const locationQuery = await prisma.$queryRaw<Array<{ lng: number; lat: number }>>`
          SELECT 
            ST_X(location::geometry) as lng,
            ST_Y(location::geometry) as lat
          FROM "Place"
          WHERE id = ${p.id}
        `;
        const location = locationQuery.length > 0 ? locationQuery[0] : null;

        console.log(`${i + 1}. ${p.nameCN} (${p.nameEN})`);
        console.log(`   ID: ${p.id}`);
        console.log(`   城市: ${p.City?.nameCN || p.City?.nameEN || '未知'}`);
        console.log(`   地址: ${p.address || '无'}`);
        console.log(`   坐标: ${location ? `(${location.lng}, ${location.lat})` : '无'}`);
        
        if (metadata) {
          if (metadata.opening_hours?.text) {
            console.log(`   营业时间: ${metadata.opening_hours.text}`);
          }
          if (metadata.services) {
            console.log(`   服务: ${metadata.services.join(', ')}`);
          }
        }
        console.log('');
      }
    }

    // 7. 显示问题（如果有）
    if (hospitalIssues.length > 0) {
      console.log('⚠️  发现的问题：\n');
      for (const issue of hospitalIssues) {
        console.log(`  ${issue.name}:`);
        for (const problem of issue.issues) {
          console.log(`    - ${problem}`);
        }
        console.log('');
      }
    }

    // 8. 统计信息
    console.log('📊 统计信息：');
    
    const nationalHospitals = hospitals.filter(h => {
      const metadata = h.metadata as any;
      return metadata?.category === 'NATIONAL_HOSPITAL';
    }).length;
    const regionalHospitals = hospitals.filter(h => {
      const metadata = h.metadata as any;
      return metadata?.category === 'REGIONAL_HOSPITAL';
    }).length;
    const clinics = hospitals.filter(h => {
      const metadata = h.metadata as any;
      return metadata?.facility_type === 'clinic';
    }).length;
    
    console.log(`   国家级医院: ${nationalHospitals}`);
    console.log(`   地区医院: ${regionalHospitals}`);
    console.log(`   私人诊所: ${clinics}`);
    console.log(`   药店: ${pharmacies.length}`);

    const avgRating = hospitals
      .filter(h => h.rating !== null)
      .reduce((sum, h) => sum + (h.rating || 0), 0) / hospitals.filter(h => h.rating !== null).length;
    console.log(`   平均评分: ${avgRating.toFixed(2)}`);

    const cities = new Set([
      ...hospitals.map(h => h.City?.nameCN || h.City?.nameEN),
      ...pharmacies.map(p => p.City?.nameCN || p.City?.nameEN),
    ].filter(Boolean));
    console.log(`   覆盖城市: ${Array.from(cities).join(', ')}`);

    // 9. 紧急信息
    console.log('\n🚨 紧急医疗信息：');
    console.log('   紧急电话: 112 (24/7)');
    console.log('   非紧急医疗咨询: 1770 (24/7)');
    console.log('   中毒控制: 114 (24/7)');
    console.log('   牙科急诊: 1776 (晚上/周末)');

  } catch (error: any) {
    console.error('\n❌ 验证失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
