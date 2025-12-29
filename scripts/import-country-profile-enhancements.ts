/**
 * 导入国家档案增强数据
 * 
 * 导入 complianceInfo 和 travelCulture 字段到 CountryProfile 表
 * 
 * 使用方法:
 *   npm run import:country-profile-enhancements [-- --country <countryCode>] [-- --file <dataFile>]
 * 
 * 示例:
 *   npm run import:country-profile-enhancements                              # 导入所有国家数据
 *   npm run import:country-profile-enhancements -- --country IS              # 只导入冰岛
 *   npm run import:country-profile-enhancements -- --file data/country-profile-enhancements.sample.json  # 从文件导入
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * 合规信息接口
 */
interface ComplianceInfo {
  /** 签证政策 */
  visaPolicies?: {
    /** 对中国公民的签证要求 */
    visaForCN?: {
      status: string; // e.g., "免签", "落地签", "需要提前申请"
      allowedStay?: string; // e.g., "30天"
      requirement?: string; // 详细要求说明
    };
    /** 国际驾照要求 */
    internationalDrivingLicense?: {
      required: boolean;
      note?: string;
    };
    /** 其他签证要求 */
    otherRequirements?: string[];
  };
  
  /** 驾驶规则 */
  drivingRules?: {
    /** 驾驶侧（left/right） */
    drivingSide: 'left' | 'right';
    /** 最低驾驶年龄 */
    minAge?: number;
    /** 是否需要国际驾照 */
    requiresInternationalLicense?: boolean;
    /** 特殊规则 */
    specialRules?: string[];
    /** 限速规则 */
    speedLimits?: {
      urban?: number; // km/h
      highway?: number; // km/h
      note?: string;
    };
  };
  
  /** 无人机规则 */
  droneRules?: {
    /** 是否允许无人机 */
    allowed: boolean;
    /** 是否需要注册 */
    requiresRegistration?: boolean;
    /** 飞行限制 */
    restrictions?: string[];
    /** 最大飞行高度（米） */
    maxAltitude?: number;
    /** 禁止区域 */
    prohibitedAreas?: string[];
  };
  
  /** 酒精政策 */
  alcoholPolicy?: {
    /** 法定饮酒年龄 */
    legalAge?: number;
    /** 血液酒精浓度限制（BAC） */
    bacLimit?: number;
    /** 是否允许公共场所饮酒 */
    publicDrinking?: boolean;
    /** 特殊规则 */
    specialRules?: string[];
  };
  
  /** 旅行警告 */
  travelWarnings?: {
    /** 当前警告级别 */
    level?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    /** 警告内容 */
    warnings?: string[];
    /** 来源 */
    source?: string;
    /** 更新时间 */
    updatedAt?: string;
  };
  
  /** 其他合规信息 */
  other?: Record<string, any>;
}

/**
 * 旅行文化接口
 */
interface TravelCulture {
  /** 小费习惯 */
  tippingHabits?: {
    /** 小费文化程度 */
    level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    /** 一般小费比例（如适用） */
    typicalPercentage?: number;
    /** 小费说明 */
    description?: string;
    /** 不同场景的小费建议 */
    scenarios?: Array<{
      scenario: string; // e.g., "餐厅", "出租车", "酒店"
      amount?: string; // e.g., "10-15%", "1-2 USD"
      note?: string;
    }>;
  };
  
  /** 禁忌列表 */
  tabooList?: Array<{
    category: string; // e.g., "宗教", "社会", "饮食"
    items: string[]; // 具体的禁忌项
  }>;
  
  /** 着装提示 */
  dressCodeHints?: Array<{
    context: string; // e.g., "宗教场所", "正式场合", "海滩"
    requirements: string[];
    suggestions?: string[];
  }>;
  
  /** 节庆日历 */
  festivalCalendar?: Array<{
    month: number; // 1-12
    name: string; // 节庆名称
    nameCN?: string; // 中文名称
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'; // 对旅行的影响
    description?: string; // 节庆说明
    travelTips?: string[]; // 旅行建议
  }>;
  
  /** 其他文化信息 */
  other?: Record<string, any>;
}

/**
 * 国家增强数据接口
 */
interface CountryEnhancementData {
  isoCode: string;
  complianceInfo?: ComplianceInfo;
  travelCulture?: TravelCulture;
}

/**
 * 示例数据（可以移到单独的 JSON 文件）
 */
const SAMPLE_DATA: CountryEnhancementData[] = [
  {
    isoCode: 'IS', // 冰岛
    complianceInfo: {
      drivingRules: {
        drivingSide: 'right',
        minAge: 17,
        requiresInternationalLicense: true,
        speedLimits: {
          urban: 50,
          highway: 90,
          note: '碎石路限速 80 km/h',
        },
        specialRules: [
          'F-road 需要 4x4 车辆',
          '冬季某些路段可能封闭',
          '注意道路上的羊',
        ],
      },
      droneRules: {
        allowed: true,
        requiresRegistration: true,
        maxAltitude: 120,
        restrictions: [
          '禁止在人群密集区域飞行',
          '需要保持至少 150 米距离',
          '禁止在国家公园内飞行（需特殊许可）',
        ],
        prohibitedAreas: ['雷克雅未克市中心', '蓝湖'],
      },
      alcoholPolicy: {
        legalAge: 20,
        bacLimit: 0.05,
        publicDrinking: false,
        specialRules: ['只能在持牌场所购买酒精'],
      },
    },
    travelCulture: {
      tippingHabits: {
        level: 'LOW',
        description: '冰岛没有强制小费文化',
        scenarios: [
          {
            scenario: '餐厅',
            amount: '可选，10%',
            note: '账单通常已包含服务费',
          },
        ],
      },
      dressCodeHints: [
        {
          context: '温泉/蓝湖',
          requirements: ['必须洗澡后进入', '禁止穿鞋'],
          suggestions: ['带好毛巾和拖鞋'],
        },
      ],
    },
  },
  {
    isoCode: 'JP', // 日本
    complianceInfo: {
      visaPolicies: {
        visaForCN: {
          status: '需要提前申请',
          allowedStay: '15-90天（根据签证类型）',
          requirement: '需要提供行程单、酒店预订等材料',
        },
        internationalDrivingLicense: {
          required: true,
          note: '需要 IDP（国际驾照）或日本驾照翻译件',
        },
      },
      drivingRules: {
        drivingSide: 'left',
        minAge: 18,
        requiresInternationalLicense: true,
        speedLimits: {
          urban: 40,
          highway: 100,
        },
      },
      alcoholPolicy: {
        legalAge: 20,
        bacLimit: 0.03,
        publicDrinking: true,
        specialRules: ['自动售货机也销售含酒精饮料'],
      },
    },
    travelCulture: {
      tippingHabits: {
        level: 'NONE',
        description: '日本不接受小费，给钱可能被认为是不礼貌的',
      },
      tabooList: [
        {
          category: '社会',
          items: ['不要在公共场合大声说话', '不要在地铁上打电话', '不要边走边吃'],
        },
        {
          category: '饮食',
          items: ['不要将筷子插在饭里', '不要用筷子传递食物'],
        },
      ],
      dressCodeHints: [
        {
          context: '寺庙/神社',
          requirements: ['脱帽', '脱鞋'],
          suggestions: ['穿着得体，避免过于暴露'],
        },
        {
          context: '温泉',
          requirements: ['必须全裸', '禁止有纹身进入'],
        },
      ],
      festivalCalendar: [
        {
          month: 3,
          name: '樱花季',
          nameCN: '樱花季',
          impact: 'POSITIVE',
          description: '日本最受欢迎的旅游季节',
          travelTips: ['提前预订酒店', '热门景点会非常拥挤', '关注樱花前线预报'],
        },
        {
          month: 8,
          name: 'Obon Festival',
          nameCN: '盂兰盆节',
          impact: 'NEGATIVE',
          description: '全国性假期，交通和住宿会非常紧张',
          travelTips: ['避免在此期间旅行', '如需出行务必提前预订'],
        },
      ],
    },
  },
  {
    isoCode: 'NO', // 挪威
    complianceInfo: {
      drivingRules: {
        drivingSide: 'right',
        minAge: 18,
        requiresInternationalLicense: true,
        speedLimits: {
          urban: 50,
          highway: 80,
        },
        specialRules: [
          '冬季需要冬季轮胎',
          '注意野生动物（特别是驼鹿）',
        ],
      },
      droneRules: {
        allowed: true,
        requiresRegistration: true,
        maxAltitude: 120,
        restrictions: [
          '禁止在人群密集区域飞行',
          '需要保持安全距离',
        ],
      },
    },
    travelCulture: {
      tippingHabits: {
        level: 'LOW',
        description: '小费不是必须的，但可以给服务费',
      },
      dressCodeHints: [
        {
          context: '户外活动',
          requirements: ['适合的防水装备'],
          suggestions: ['注意天气变化，准备分层着装'],
        },
      ],
    },
  },
];

/**
 * 从文件加载数据
 */
function loadDataFromFile(filePath: string): CountryEnhancementData[] {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${fullPath}`);
  }
  
  const fileContent = fs.readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(fileContent);
  
  if (!Array.isArray(data)) {
    throw new Error('数据文件必须是数组格式');
  }
  
  return data;
}

/**
 * 导入单个国家的增强数据
 */
async function importCountryEnhancement(
  data: CountryEnhancementData
): Promise<{ success: boolean; message: string }> {
  try {
    // 检查国家是否存在
    const existing = await prisma.countryProfile.findUnique({
      where: { isoCode: data.isoCode },
    });
    
    if (!existing) {
      return {
        success: false,
        message: `国家不存在: ${data.isoCode}`,
      };
    }
    
    // 更新数据
    const updateData: {
      complianceInfo?: any;
      travelCulture?: any;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    
    if (data.complianceInfo !== undefined) {
      updateData.complianceInfo = data.complianceInfo;
    }
    
    if (data.travelCulture !== undefined) {
      updateData.travelCulture = data.travelCulture;
    }
    
    await prisma.countryProfile.update({
      where: { isoCode: data.isoCode },
      data: updateData as any,
    });
    
    return {
      success: true,
      message: `成功更新 ${data.isoCode}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `更新失败 ${data.isoCode}: ${error.message}`,
    };
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const countryIndex = args.indexOf('--country');
  const fileIndex = args.indexOf('--file');
  
  // 解析参数
  const targetCountry = countryIndex !== -1 ? args[countryIndex + 1] : null;
  const dataFile = fileIndex !== -1 ? args[fileIndex + 1] : null;
  
  let dataToImport: CountryEnhancementData[] = [];
  
  // 加载数据
  if (dataFile) {
    console.log(`📂 从文件加载数据: ${dataFile}`);
    dataToImport = loadDataFromFile(dataFile);
  } else {
    console.log('📋 使用示例数据');
    dataToImport = SAMPLE_DATA;
  }
  
  // 过滤目标国家
  if (targetCountry) {
    dataToImport = dataToImport.filter(d => d.isoCode === targetCountry.toUpperCase());
    if (dataToImport.length === 0) {
      console.error(`❌ 未找到匹配的国家: ${targetCountry}`);
      process.exit(1);
    }
  }
  
  console.log(`\n🚀 开始导入 ${dataToImport.length} 个国家的增强数据\n`);
  
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  
  // 依次处理每个国家
  for (const countryData of dataToImport) {
    const result = await importCountryEnhancement(countryData);
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
      successCount++;
    } else {
      console.error(`❌ ${result.message}`);
      failCount++;
    }
  }
  
  const duration = Date.now() - startTime;
  
  console.log(`\n📊 导入完成:`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   ⏱️  耗时: ${duration}ms\n`);
}

// 执行主函数
main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

