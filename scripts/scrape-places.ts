// scripts/scrape-places.ts
import { ApifyClient } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;

if (!API_TOKEN || API_TOKEN.includes('YOUR_APIFY')) {
    console.error('❌ 错误: 未找到有效的 APIFY_TOKEN');
    process.exit(1);
}

const client = new ApifyClient({ token: API_TOKEN });

// 使用 Compass Google Maps Crawler ID
const ACTOR_ID = "nwua9Gu5YrADL7ZDj"; 

interface CleanedPlaceData {
    name: string;
    address: string;
    googlePlaceId: string;
    location: { lat: number; lng: number };
    metadata: any;
    rating?: number;
    category: string;
}

async function main() {
    console.log('🚀 开始【纯中文】抓取任务 (带严格限制)...');

    // 1. 定义搜索关键词
    const searchTerms = [
        'Blue Lagoon Iceland',
        'Hallgrimskirkja Reykjavik',
        'Gullfoss Waterfall',
        'Black Sand Beach Vik',
        'Jökulsárlón Glacier Lagoon', 
        'Bonus Supermarket Iceland'   
    ];

    // 2. 配置参数 (加上紧箍咒)
    const input = {
        searchStringsArray: searchTerms,
        locationQuery: 'Iceland', 
        
        // 🔥🔥 关键修改：总数限制 🔥🔥
        // 一旦整个任务抓取到的唯一地点达到这个数，立即停止
        maxCrawledPlaces: 20,       
        
        // 每个关键词的限制
        maxCrawledPlacesPerSearch: 5, 
        
        language: 'zh-CN', 
        scrapeAdvertisers: false,
        zoom: 10, // 稍微缩小 Zoom，减少地图切片数量
        
        maxReviews: 0, 
        maxImages: 0,  
        includeOpeningHours: true,
        includePopularTimes: true,
    };

    console.log(`📡 正在启动爬虫 (Actor: ${ACTOR_ID})...`);
    
    try {
        // 3. 执行抓取
        const run = await client.actor(ACTOR_ID).call(input);

        console.log('✅ 爬虫任务结束，正在下载数据...');

        // 4. 获取数据
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (items.length === 0) {
            console.warn('⚠️  警告: 未抓取到任何数据');
            return;
        }

        console.log(`📦 原始数据共 ${items.length} 条，开始清洗...`);

        // 5. 数据清洗
        const cleanedData = items.map((raw: any) => cleanData(raw));

        // 6. 保存
        const outputPath = path.join(process.cwd(), 'places-data.json');
        fs.writeFileSync(outputPath, JSON.stringify(cleanedData, null, 2));
        console.log(`💾 数据已保存到 ${outputPath}，共 ${cleanedData.length} 条`);

    } catch (error: any) {
        console.error('❌ 抓取过程中发生错误:', error.message);
        // 如果是中途断开，尽量去后台看看有没有部分数据
        console.log('💡 提示: 如果是超时错误，您可以尝试去 Apify 控制台手动下载 Dataset。');
        process.exit(1);
    }
}

// 🧹 数据清洗函数
function cleanData(raw: any): CleanedPlaceData {
    return {
        name: raw.title || raw.name, 
        address: raw.address,
        googlePlaceId: raw.placeId || raw.googlePlaceId,
        location: {
            lat: raw.location?.lat || raw.coordinates?.latitude,
            lng: raw.location?.lng || raw.coordinates?.longitude,
        },
        metadata: {
            phone: raw.phone,
            website: raw.website,
            openingHours: normalizeOpeningHours(raw.openingHours),
            facilities: extractFacilities(raw.additionalInfo, raw.tags),
            payment: extractPaymentMethods(raw.additionalInfo, raw.tags),
            timezone: 'Atlantic/Reykjavik', 
            lastCrawledAt: new Date().toISOString(),
            rawCategory: raw.categoryName // 保留原始分类以便调试
        },
        rating: raw.totalScore || raw.rating,
        category: raw.categoryName || 'ATTRACTION',
    };
}

// === 辅助函数 ===

function normalizeOpeningHours(openingHours: any): any {
    if (!openingHours) return null;
    if (typeof openingHours === 'object' && !Array.isArray(openingHours)) return openingHours;
    if (Array.isArray(openingHours)) {
        const normalized: any = {};
        openingHours.forEach((item: any) => {
            if (item.day && item.hours) {
                const dayKey = item.day.toLowerCase().substring(0, 3);
                normalized[dayKey] = item.hours;
            }
        });
        return normalized;
    }
    return null;
}

function extractFacilities(additionalInfo: any, tags: any[]): any {
    const facilities: any = {};
    const allTags = [
        ...(tags || []),
        ...Object.values(additionalInfo || {}).flat().map((i: any) => {
            if (typeof i === 'string') return i;
            if (typeof i === 'object' && i !== null) return Object.keys(i)[0] || Object.values(i)[0];
            return null;
        }).filter(Boolean)
    ];

    if (allTags.some(t => String(t).includes('无障碍') || String(t).toLowerCase().includes('wheelchair'))) {
        facilities.wheelchair = { accessible: true };
    }
    if (allTags.some(t => String(t).includes('儿童') || String(t).toLowerCase().includes('kids'))) {
        facilities.children = { strollerAccessible: true };
    }
    return facilities;
}

function extractPaymentMethods(additionalInfo: any, tags: any[]): string[] {
    const paymentMethods: string[] = [];
    const allTags = [
        ...(tags || []),
        ...Object.values(additionalInfo || {}).flat()
    ];
    const keywords: Record<string, string> = {
        'visa': 'Visa', 'mastercard': 'Mastercard', 'alipay': 'Alipay', 'wechat': 'WeChat Pay', 'cash': 'Cash',
        '现金': 'Cash', '信用卡': 'Credit Card', '支付宝': 'Alipay', '微信': 'WeChat Pay'
    };
    allTags.forEach(tag => {
        const tagStr = String(tag).toLowerCase();
        Object.entries(keywords).forEach(([k, v]) => {
            if (tagStr.includes(k) && !paymentMethods.includes(v)) paymentMethods.push(v);
        });
    });
    // 冰岛默认策略：如果没有抓到，默认为信用卡
    if (paymentMethods.length === 0) return ['Credit Card'];
    return paymentMethods;
}

main().catch(console.error);