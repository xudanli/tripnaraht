// src/trips/utils/trip-name.util.ts

/**
 * 行程名称工具函数
 * 用于生成默认行程名称和获取目的地名称
 */

/**
 * 从国家代码获取目的地名称（中文）
 */
export function getDestinationName(countryCode: string): string {
  // 常见国家代码映射
  const countryNames: Record<string, string> = {
    'CN': '中国',
    'JP': '日本',
    'KR': '韩国',
    'TH': '泰国',
    'VN': '越南',
    'SG': '新加坡',
    'MY': '马来西亚',
    'ID': '印度尼西亚',
    'PH': '菲律宾',
    'US': '美国',
    'CA': '加拿大',
    'AU': '澳大利亚',
    'NZ': '新西兰',
    'GB': '英国',
    'FR': '法国',
    'DE': '德国',
    'IT': '意大利',
    'ES': '西班牙',
    'IS': '冰岛',
    'NO': '挪威',
    'SE': '瑞典',
    'FI': '芬兰',
    'DK': '丹麦',
    'CH': '瑞士',
    'AT': '奥地利',
    'NL': '荷兰',
    'BE': '比利时',
    'PT': '葡萄牙',
    'GR': '希腊',
    'TR': '土耳其',
    'AE': '阿联酋',
    'EG': '埃及',
    'ZA': '南非',
    'BR': '巴西',
    'AR': '阿根廷',
    'MX': '墨西哥',
    'IN': '印度',
    'RU': '俄罗斯',
    'NP': '尼泊尔',
    'XZ': '西藏',
    'LF': '罗弗敦',
    'K2': 'K2',
    'SJ': '斯瓦尔巴',
    'GL': '格陵兰',
    'AL': '阿尔卑斯',
  };

  return countryNames[countryCode?.toUpperCase()] || countryCode || '未知目的地';
}

/**
 * 生成默认行程名称
 * 格式：{目的地名称} {开始日期}
 * 例如：冰岛 2025-06-01
 */
export function generateDefaultTripName(params: {
  destination: string;
  startDate: string | Date;
}): string {
  const destinationName = getDestinationName(params.destination);
  
  // 处理日期格式
  let dateStr: string;
  if (params.startDate instanceof Date) {
    dateStr = params.startDate.toISOString().split('T')[0];
  } else {
    // 提取日期部分（YYYY-MM-DD）
    dateStr = params.startDate.split('T')[0];
  }
  
  return `${destinationName} ${dateStr}`;
}
