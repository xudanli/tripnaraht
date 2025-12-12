import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import countries from 'i18n-iso-countries';
import zhLocale from 'i18n-iso-countries/langs/zh.json';

dotenv.config();

const prisma = new PrismaClient();

// 注册中文语言包
countries.registerLocale(zhLocale);

/**
 * 国家货币映射表（ISO 4217 货币代码）
 * 包含主要旅游国家的货币信息
 */
const COUNTRY_CURRENCY_MAP: Record<string, { code: string; name: string }> = {
  // 亚洲
  'JP': { code: 'JPY', name: '日元' },
  'KR': { code: 'KRW', name: '韩元' },
  'CN': { code: 'CNY', name: '人民币' },
  'TW': { code: 'TWD', name: '新台币' },
  'HK': { code: 'HKD', name: '港币' },
  'MO': { code: 'MOP', name: '澳门元' },
  'SG': { code: 'SGD', name: '新加坡元' },
  'MY': { code: 'MYR', name: '马来西亚林吉特' },
  'TH': { code: 'THB', name: '泰铢' },
  'VN': { code: 'VND', name: '越南盾' },
  'ID': { code: 'IDR', name: '印尼盾' },
  'PH': { code: 'PHP', name: '菲律宾比索' },
  'IN': { code: 'INR', name: '印度卢比' },
  'BD': { code: 'BDT', name: '孟加拉塔卡' },
  'PK': { code: 'PKR', name: '巴基斯坦卢比' },
  'LK': { code: 'LKR', name: '斯里兰卡卢比' },
  'MM': { code: 'MMK', name: '缅甸元' },
  'KH': { code: 'KHR', name: '柬埔寨瑞尔' },
  'LA': { code: 'LAK', name: '老挝基普' },
  'BN': { code: 'BND', name: '文莱元' },
  'NP': { code: 'NPR', name: '尼泊尔卢比' },
  'BT': { code: 'BTN', name: '不丹努尔特鲁姆' },
  'MV': { code: 'MVR', name: '马尔代夫拉菲亚' },
  'AF': { code: 'AFN', name: '阿富汗尼' },
  'IR': { code: 'IRR', name: '伊朗里亚尔' },
  'IQ': { code: 'IQD', name: '伊拉克第纳尔' },
  'IL': { code: 'ILS', name: '以色列新谢克尔' },
  'JO': { code: 'JOD', name: '约旦第纳尔' },
  'LB': { code: 'LBP', name: '黎巴嫩镑' },
  'SA': { code: 'SAR', name: '沙特里亚尔' },
  'AE': { code: 'AED', name: '阿联酋迪拉姆' },
  'OM': { code: 'OMR', name: '阿曼里亚尔' },
  'YE': { code: 'YER', name: '也门里亚尔' },
  'QA': { code: 'QAR', name: '卡塔尔里亚尔' },
  'KW': { code: 'KWD', name: '科威特第纳尔' },
  'BH': { code: 'BHD', name: '巴林第纳尔' },
  'KZ': { code: 'KZT', name: '哈萨克斯坦坚戈' },
  'UZ': { code: 'UZS', name: '乌兹别克斯坦索姆' },
  'KG': { code: 'KGS', name: '吉尔吉斯斯坦索姆' },
  'TJ': { code: 'TJS', name: '塔吉克斯坦索莫尼' },
  'TM': { code: 'TMT', name: '土库曼斯坦马纳特' },
  'MN': { code: 'MNT', name: '蒙古图格里克' },
  
  // 欧洲
  'GB': { code: 'GBP', name: '英镑' },
  'IE': { code: 'EUR', name: '欧元' },
  'FR': { code: 'EUR', name: '欧元' },
  'DE': { code: 'EUR', name: '欧元' },
  'IT': { code: 'EUR', name: '欧元' },
  'ES': { code: 'EUR', name: '欧元' },
  'PT': { code: 'EUR', name: '欧元' },
  'NL': { code: 'EUR', name: '欧元' },
  'BE': { code: 'EUR', name: '欧元' },
  'AT': { code: 'EUR', name: '欧元' },
  'CH': { code: 'CHF', name: '瑞士法郎' },
  'SE': { code: 'SEK', name: '瑞典克朗' },
  'NO': { code: 'NOK', name: '挪威克朗' },
  'DK': { code: 'DKK', name: '丹麦克朗' },
  'FI': { code: 'EUR', name: '欧元' },
  'IS': { code: 'ISK', name: '冰岛克朗' },
  'PL': { code: 'PLN', name: '波兰兹罗提' },
  'CZ': { code: 'CZK', name: '捷克克朗' },
  'SK': { code: 'EUR', name: '欧元' },
  'HU': { code: 'HUF', name: '匈牙利福林' },
  'RO': { code: 'RON', name: '罗马尼亚列伊' },
  'BG': { code: 'BGN', name: '保加利亚列弗' },
  'GR': { code: 'EUR', name: '欧元' },
  'HR': { code: 'EUR', name: '欧元' },
  'RS': { code: 'RSD', name: '塞尔维亚第纳尔' },
  'BA': { code: 'BAM', name: '波黑可兑换马克' },
  'ME': { code: 'EUR', name: '欧元' },
  'MK': { code: 'MKD', name: '北马其顿第纳尔' },
  'AL': { code: 'ALL', name: '阿尔巴尼亚列克' },
  'SI': { code: 'EUR', name: '欧元' },
  'EE': { code: 'EUR', name: '欧元' },
  'LV': { code: 'EUR', name: '欧元' },
  'LT': { code: 'EUR', name: '欧元' },
  'RU': { code: 'RUB', name: '俄罗斯卢布' },
  'UA': { code: 'UAH', name: '乌克兰格里夫纳' },
  'BY': { code: 'BYN', name: '白俄罗斯卢布' },
  'MD': { code: 'MDL', name: '摩尔多瓦列伊' },
  'LU': { code: 'EUR', name: '欧元' },
  'MC': { code: 'EUR', name: '欧元' },
  'AD': { code: 'EUR', name: '欧元' },
  'VA': { code: 'EUR', name: '欧元' },
  'CY': { code: 'EUR', name: '欧元' },
  'AZ': { code: 'AZN', name: '阿塞拜疆马纳特' },
  'AM': { code: 'AMD', name: '亚美尼亚德拉姆' },
  'GE': { code: 'GEL', name: '格鲁吉亚拉里' },
  'SY': { code: 'SYP', name: '叙利亚镑' },
  'TR': { code: 'TRY', name: '土耳其里拉' },
  'LI': { code: 'CHF', name: '瑞士法郎' },
  'MT': { code: 'EUR', name: '欧元' },
  'SM': { code: 'EUR', name: '欧元' },
  'KP': { code: 'KPW', name: '朝鲜元' },
  
  // 美洲
  'US': { code: 'USD', name: '美元' },
  'CA': { code: 'CAD', name: '加拿大元' },
  'MX': { code: 'MXN', name: '墨西哥比索' },
  'BR': { code: 'BRL', name: '巴西雷亚尔' },
  'AR': { code: 'ARS', name: '阿根廷比索' },
  'CL': { code: 'CLP', name: '智利比索' },
  'CO': { code: 'COP', name: '哥伦比亚比索' },
  'PE': { code: 'PEN', name: '秘鲁索尔' },
  'VE': { code: 'VES', name: '委内瑞拉玻利瓦尔' },
  'EC': { code: 'USD', name: '美元' },
  'UY': { code: 'UYU', name: '乌拉圭比索' },
  'PY': { code: 'PYG', name: '巴拉圭瓜拉尼' },
  'BO': { code: 'BOB', name: '玻利维亚诺' },
  'GY': { code: 'GYD', name: '圭亚那元' },
  'SR': { code: 'SRD', name: '苏里南元' },
  'GF': { code: 'EUR', name: '欧元' },
  'FK': { code: 'FKP', name: '福克兰群岛镑' },
  'JM': { code: 'JMD', name: '牙买加元' },
  'CU': { code: 'CUP', name: '古巴比索' },
  'HT': { code: 'HTG', name: '海地古德' },
  'DO': { code: 'DOP', name: '多米尼加比索' },
  'PR': { code: 'USD', name: '美元' },
  'TT': { code: 'TTD', name: '特立尼达和多巴哥元' },
  'BB': { code: 'BBD', name: '巴巴多斯元' },
  'BS': { code: 'BSD', name: '巴哈马元' },
  'BZ': { code: 'BZD', name: '伯利兹元' },
  'GT': { code: 'GTQ', name: '危地马拉格查尔' },
  'HN': { code: 'HNL', name: '洪都拉斯伦皮拉' },
  'NI': { code: 'NIO', name: '尼加拉瓜科多巴' },
  'CR': { code: 'CRC', name: '哥斯达黎加科朗' },
  'PA': { code: 'PAB', name: '巴拿马巴波亚' },
  'VC': { code: 'XCD', name: '东加勒比元' },
  'SV': { code: 'USD', name: '美元' },
  'AG': { code: 'XCD', name: '东加勒比元' },
  'GD': { code: 'XCD', name: '东加勒比元' },
  'KN': { code: 'XCD', name: '东加勒比元' },
  'LC': { code: 'XCD', name: '东加勒比元' },
  'DM': { code: 'XCD', name: '东加勒比元' },
  
  // 大洋洲
  'AU': { code: 'AUD', name: '澳大利亚元' },
  'NZ': { code: 'NZD', name: '新西兰元' },
  'FJ': { code: 'FJD', name: '斐济元' },
  'PG': { code: 'PGK', name: '巴布亚新几内亚基那' },
  'NC': { code: 'XPF', name: '太平洋法郎' },
  'PF': { code: 'XPF', name: '太平洋法郎' },
  'MH': { code: 'USD', name: '美元' },
  'PW': { code: 'USD', name: '美元' },
  'NR': { code: 'AUD', name: '澳元' },
  'TV': { code: 'AUD', name: '澳元' },
  'TL': { code: 'USD', name: '美元' },
  'FM': { code: 'USD', name: '美元' },
  'VU': { code: 'VUV', name: '瓦努阿图瓦图' },
  'WS': { code: 'WST', name: '萨摩亚塔拉' },
  'TO': { code: 'TOP', name: '汤加潘加' },
  'SB': { code: 'SBD', name: '所罗门群岛元' },
  'KI': { code: 'AUD', name: '澳元' },
  
  // 非洲
  'ZA': { code: 'ZAR', name: '南非兰特' },
  'EG': { code: 'EGP', name: '埃及镑' },
  'MA': { code: 'MAD', name: '摩洛哥迪拉姆' },
  'TN': { code: 'TND', name: '突尼斯第纳尔' },
  'DZ': { code: 'DZD', name: '阿尔及利亚第纳尔' },
  'LY': { code: 'LYD', name: '利比亚第纳尔' },
  'ET': { code: 'ETB', name: '埃塞俄比亚比尔' },
  'KE': { code: 'KES', name: '肯尼亚先令' },
  'TZ': { code: 'TZS', name: '坦桑尼亚先令' },
  'UG': { code: 'UGX', name: '乌干达先令' },
  'RW': { code: 'RWF', name: '卢旺达法郎' },
  'GH': { code: 'GHS', name: '加纳塞地' },
  'NG': { code: 'NGN', name: '尼日利亚奈拉' },
  'SN': { code: 'XOF', name: '西非法郎' },
  'CI': { code: 'XOF', name: '西非法郎' },
  'CM': { code: 'XAF', name: '中非法郎' },
  'GA': { code: 'XAF', name: '中非法郎' },
  'CG': { code: 'XAF', name: '中非法郎' },
  'CD': { code: 'CDF', name: '刚果法郎' },
  'AO': { code: 'AOA', name: '安哥拉宽扎' },
  'ZM': { code: 'ZMW', name: '赞比亚克瓦查' },
  'ZW': { code: 'ZWL', name: '津巴布韦元' },
  'MW': { code: 'MWK', name: '马拉维克瓦查' },
  'MZ': { code: 'MZN', name: '莫桑比克梅蒂卡尔' },
  'MG': { code: 'MGA', name: '马达加斯加阿里亚里' },
  'MU': { code: 'MUR', name: '毛里求斯卢比' },
  'SC': { code: 'SCR', name: '塞舌尔卢比' },
  'KM': { code: 'KMF', name: '科摩罗法郎' },
  'DJ': { code: 'DJF', name: '吉布提法郎' },
  'SO': { code: 'SOS', name: '索马里先令' },
  'ER': { code: 'ERN', name: '厄立特里亚纳克法' },
  'SD': { code: 'SDG', name: '苏丹镑' },
  'SS': { code: 'SSP', name: '南苏丹镑' },
  'NE': { code: 'XOF', name: '西非非共体法郎' },
  'ML': { code: 'XOF', name: '西非非共体法郎' },
  'TG': { code: 'XOF', name: '西非非共体法郎' },
  'CV': { code: 'CVE', name: '佛得角埃斯库多' },
  'MR': { code: 'MRU', name: '毛里塔尼亚乌吉亚' },
  'NA': { code: 'NAD', name: '纳米比亚元' },
  'SL': { code: 'SLL', name: '利昂' },
  'ST': { code: 'STD', name: '多布拉' },
  'BJ': { code: 'XOF', name: '西非非共体法郎' },
  'BF': { code: 'XOF', name: '西非非共体法郎' },
  'BI': { code: 'BIF', name: '布隆迪法郎' },
  'TD': { code: 'XAF', name: '中非非共体法郎' },
  'CF': { code: 'XAF', name: '中非非共体法郎' },
  'GQ': { code: 'XAF', name: '中非非共体法郎' },
  'SZ': { code: 'SZL', name: '斯威士兰里朗吉尼' },
  'BW': { code: 'BWP', name: '博茨瓦纳普拉' },
  'GM': { code: 'GMD', name: '冈比亚达拉西' },
  'GN': { code: 'GNF', name: '几内亚法郎' },
  'GW': { code: 'XOF', name: '西非非共体法郎' },
  'LR': { code: 'LRD', name: '利比里亚元' },
  'LS': { code: 'LSL', name: '莱索托洛蒂' },
};

/**
 * 插座信息映射表
 */
const POWER_INFO_MAP: Record<string, { voltage: number; frequency: number; plugTypes: string[] }> = {
  // 亚洲
  'JP': { voltage: 100, frequency: 50, plugTypes: ['A', 'B'] }, // 注：日本部分地区为60Hz
  'KR': { voltage: 220, frequency: 60, plugTypes: ['C', 'F'] },
  'CN': { voltage: 220, frequency: 50, plugTypes: ['A', 'I'] },
  'TW': { voltage: 110, frequency: 60, plugTypes: ['A', 'B'] },
  'HK': { voltage: 220, frequency: 50, plugTypes: ['G', 'D'] },
  'MO': { voltage: 220, frequency: 50, plugTypes: ['G'] },
  'SG': { voltage: 230, frequency: 50, plugTypes: ['C', 'G', 'M'] },
  'MY': { voltage: 240, frequency: 50, plugTypes: ['G'] },
  'TH': { voltage: 220, frequency: 50, plugTypes: ['A', 'B', 'C', 'F'] },
  'VN': { voltage: 220, frequency: 50, plugTypes: ['A', 'C', 'G'] },
  'ID': { voltage: 230, frequency: 50, plugTypes: ['C', 'F', 'G'] },
  'PH': { voltage: 220, frequency: 60, plugTypes: ['A', 'B', 'C'] },
  'IN': { voltage: 230, frequency: 50, plugTypes: ['C', 'D', 'M'] },
  'IL': { voltage: 230, frequency: 50, plugTypes: ['C', 'H'] },
  'SA': { voltage: 230, frequency: 60, plugTypes: ['G'] },
  'AE': { voltage: 230, frequency: 50, plugTypes: ['D', 'G', 'C'] },
  'TR': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  
  // 欧洲
  'GB': { voltage: 230, frequency: 50, plugTypes: ['G'] },
  'FR': { voltage: 230, frequency: 50, plugTypes: ['C', 'E'] },
  'DE': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'IT': { voltage: 230, frequency: 50, plugTypes: ['C', 'F', 'L'] },
  'ES': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'PT': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'NL': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'BE': { voltage: 230, frequency: 50, plugTypes: ['C', 'E'] },
  'AT': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'CH': { voltage: 230, frequency: 50, plugTypes: ['C', 'J'] },
  'SE': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'NO': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'DK': { voltage: 230, frequency: 50, plugTypes: ['C', 'E', 'K'] },
  'FI': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'IS': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'PL': { voltage: 230, frequency: 50, plugTypes: ['C', 'E'] },
  'CZ': { voltage: 230, frequency: 50, plugTypes: ['C', 'E'] },
  'GR': { voltage: 230, frequency: 50, plugTypes: ['C', 'F'] },
  'RU': { voltage: 220, frequency: 50, plugTypes: ['C', 'F'] },
  
  // 北美洲
  'US': { voltage: 120, frequency: 60, plugTypes: ['A', 'B'] },
  'CA': { voltage: 120, frequency: 60, plugTypes: ['A', 'B'] },
  'MX': { voltage: 127, frequency: 60, plugTypes: ['A', 'B'] },
  
  // 南美洲
  'BR': { voltage: 127, frequency: 60, plugTypes: ['C', 'N'] }, // 注：巴西部分地区为220V
  'AR': { voltage: 220, frequency: 50, plugTypes: ['C', 'I'] },
  'CL': { voltage: 220, frequency: 50, plugTypes: ['C', 'L'] },
  
  // 大洋洲
  'AU': { voltage: 230, frequency: 50, plugTypes: ['I'] },
  'NZ': { voltage: 230, frequency: 50, plugTypes: ['I'] },
  
  // 非洲
  'ZA': { voltage: 230, frequency: 50, plugTypes: ['C', 'M', 'N'] },
  'EG': { voltage: 220, frequency: 50, plugTypes: ['C', 'F'] },
};

/**
 * 紧急电话映射表
 * 
 * 注意：
 * - 有些国家有多个紧急电话（用斜杠分隔，如 '999/112'），表示都可以使用
 * - 电话号码格式保持原样，包含斜杠和特殊字符
 */
const EMERGENCY_MAP: Record<string, { police: string; fire: string; medical: string }> = {
  // 主要国家
  'US': { police: '911', fire: '911', medical: '911' },
  'CA': { police: '911', fire: '911', medical: '911' },
  'GB': { police: '999/112', fire: '999/112', medical: '999/112' },
  'CN': { police: '110', fire: '119', medical: '120' },
  'AU': { police: '000', fire: '000', medical: '000' },
  'NZ': { police: '111', fire: '111', medical: '111' },
  'JP': { police: '110', fire: '119', medical: '119' },
  'KR': { police: '112', fire: '119', medical: '119' },
  'MX': { police: '911', fire: '911', medical: '911' },
  'FR': { police: '17/112', fire: '18/112', medical: '15/112' },
  'DE': { police: '110', fire: '112', medical: '112' },
  'IT': { police: '112', fire: '115/112', medical: '118/112' },
  'BR': { police: '190', fire: '193', medical: '192' },
  'IN': { police: '100/112', fire: '101/112', medical: '102/112' },
  'RU': { police: '102/112', fire: '101/112', medical: '103/112' },
  'ZA': { police: '10111', fire: '10177', medical: '10177' },
  'HK': { police: '999', fire: '999', medical: '999' },
  'MO': { police: '999', fire: '999', medical: '999' },
  'TW': { police: '110', fire: '119', medical: '119' },
  'SG': { police: '999', fire: '995', medical: '995' },
  'AE': { police: '999', fire: '997', medical: '998' },
  'ES': { police: '112', fire: '112', medical: '112' },
  'NL': { police: '112', fire: '112', medical: '112' },
  'SE': { police: '112', fire: '112', medical: '112' },
  'TR': { police: '112', fire: '112', medical: '112' },
  
  // 欧洲其他国家
  'AL': { police: '129/112', fire: '128/112', medical: '127/112' },
  'AD': { police: '110/112', fire: '118/112', medical: '118/112' },
  'AT': { police: '133/112', fire: '122/112', medical: '144/112' },
  'BE': { police: '101/112', fire: '112', medical: '112' },
  'BG': { police: '112', fire: '112', medical: '112' },
  'HR': { police: '112', fire: '112', medical: '112' },
  'CY': { police: '112', fire: '112', medical: '112' },
  'CZ': { police: '158/112', fire: '150/112', medical: '155/112' },
  'DK': { police: '112', fire: '112', medical: '112' },
  'EE': { police: '112', fire: '112', medical: '112' },
  'FI': { police: '112', fire: '112', medical: '112' },
  'NO': { police: '112', fire: '110', medical: '113' },
  'GE': { police: '112', fire: '112', medical: '112' },
  'GR': { police: '112', fire: '112', medical: '112' },
  'HU': { police: '112', fire: '112', medical: '112' },
  'IS': { police: '112', fire: '112', medical: '112' },
  'IE': { police: '112/999', fire: '112/999', medical: '112/999' },
  'LV': { police: '112', fire: '112', medical: '112' },
  'LI': { police: '112', fire: '112', medical: '112' },
  'LT': { police: '112', fire: '112', medical: '112' },
  'LU': { police: '112', fire: '112', medical: '112' },
  'MC': { police: '17/112', fire: '18/112', medical: '15/112' },
  'MD': { police: '902', fire: '901', medical: '903' },
  'ME': { police: '122', fire: '123', medical: '124' },
  'BA': { police: '122', fire: '123', medical: '124' },
  'MT': { police: '112', fire: '112', medical: '112' },
  'PL': { police: '112', fire: '112', medical: '112' },
  'PT': { police: '112', fire: '112', medical: '112' },
  'RO': { police: '112', fire: '112', medical: '112' },
  'RS': { police: '192', fire: '193', medical: '194' },
  'SK': { police: '158/112', fire: '150/112', medical: '155/112' },
  'SI': { police: '112', fire: '112', medical: '112' },
  'CH': { police: '117', fire: '118', medical: '144' },
  'UA': { police: '102', fire: '101', medical: '103' },
  'VA': { police: '112', fire: '115', medical: '113' },
  'BY': { police: '102', fire: '101', medical: '103' },
  'MK': { police: '192', fire: '193', medical: '194' },
  'SM': { police: '112', fire: '118', medical: '118' },
  
  // 亚洲其他国家
  'AF': { police: '119', fire: '119', medical: '102' },
  'AM': { police: '102', fire: '101', medical: '103' },
  'AZ': { police: '102', fire: '101', medical: '103' },
  'BD': { police: '999', fire: '999', medical: '999' },
  'BT': { police: '110', fire: '112', medical: '113' },
  'KH': { police: '117', fire: '118', medical: '119' },
  'ID': { police: '110', fire: '113', medical: '118' },
  'IR': { police: '110', fire: '125', medical: '115' },
  'IQ': { police: '104', fire: '105', medical: '106' },
  'IL': { police: '100', fire: '102', medical: '101' },
  'JO': { police: '911', fire: '911', medical: '911' },
  'KZ': { police: '102', fire: '101', medical: '103' },
  'KW': { police: '112', fire: '112', medical: '112' },
  'KG': { police: '102', fire: '101', medical: '103' },
  'LA': { police: '191', fire: '190', medical: '195' },
  'LB': { police: '112', fire: '112', medical: '112' },
  'MY': { police: '999', fire: '994', medical: '999' },
  'MN': { police: '102', fire: '101', medical: '103' },
  'NP': { police: '100', fire: '101', medical: '102' },
  'OM': { police: '999', fire: '999', medical: '999' },
  'PK': { police: '15', fire: '16', medical: '1122' },
  'PH': { police: '911', fire: '911', medical: '911' },
  'QA': { police: '999', fire: '999', medical: '999' },
  'SA': { police: '999', fire: '998', medical: '997' },
  'LK': { police: '119', fire: '110', medical: '110' },
  'SY': { police: '112', fire: '113', medical: '110' },
  'TH': { police: '191', fire: '199', medical: '191' },
  'TJ': { police: '102', fire: '101', medical: '103' },
  'TL': { police: '112', fire: '115', medical: '110' },
  'TM': { police: '102', fire: '101', medical: '103' },
  'UZ': { police: '102', fire: '101', medical: '103' },
  'VN': { police: '113', fire: '114', medical: '115' },
  'YE': { police: '199', fire: '199', medical: '199' },
  'BH': { police: '999', fire: '999', medical: '999' },
  'BN': { police: '993', fire: '995', medical: '991' },
  'KP': { police: '119', fire: '119', medical: '119' },
  'MV': { police: '119', fire: '118', medical: '102' },
  'MM': { police: '199', fire: '191', medical: '192' },
  
  // 北美洲
  'AG': { police: '911', fire: '911', medical: '911' },
  'AW': { police: '911', fire: '911', medical: '911' },
  'BS': { police: '919', fire: '919', medical: '919' },
  'BB': { police: '211', fire: '311', medical: '511' },
  'BZ': { police: '911', fire: '911', medical: '911' },
  'BM': { police: '911', fire: '911', medical: '911' },
  'CR': { police: '911', fire: '911', medical: '911' },
  'DO': { police: '911', fire: '911', medical: '911' },
  'SV': { police: '911', fire: '911', medical: '911' },
  'GT': { police: '110', fire: '122', medical: '128' },
  'HN': { police: '911', fire: '911', medical: '911' },
  'JM': { police: '119', fire: '110', medical: '110' },
  'NI': { police: '118', fire: '115', medical: '120' },
  'PA': { police: '100', fire: '102', medical: '101' },
  'TT': { police: '999', fire: '990', medical: '990' },
  'UY': { police: '911', fire: '911', medical: '911' },
  'VE': { police: '911', fire: '911', medical: '911' },
  'DM': { police: '999', fire: '999', medical: '999' },
  'GD': { police: '911', fire: '911', medical: '434' },
  'KN': { police: '911', fire: '911', medical: '911' },
  'LC': { police: '911', fire: '911', medical: '911' },
  'VC': { police: '999', fire: '999', medical: '999' },
  
  // 南美洲
  'AR': { police: '911/101', fire: '100', medical: '107' },
  'BO': { police: '110', fire: '119', medical: '118' },
  'CL': { police: '133', fire: '132', medical: '131' },
  'CO': { police: '123', fire: '123', medical: '123' },
  'EC': { police: '911', fire: '911', medical: '911' },
  'GF': { police: '17', fire: '18', medical: '15' },
  'GY': { police: '911', fire: '912', medical: '913' },
  'PY': { police: '911', fire: '132', medical: '141' },
  'PE': { police: '105', fire: '116', medical: '106' },
  'SR': { police: '115', fire: '110', medical: '113' },
  
  // 大洋洲
  'FJ': { police: '911', fire: '911', medical: '911' },
  'PG': { police: '112', fire: '110', medical: '111' },
  'WS': { police: '911', fire: '911', medical: '911' },
  'VU': { police: '112', fire: '112', medical: '112' },
  'FM': { police: '911', fire: '911', medical: '911' },
  'KI': { police: '992', fire: '993', medical: '994' },
  'MH': { police: '911', fire: '911', medical: '911' },
  'NR': { police: '110', fire: '110', medical: '110' },
  'PW': { police: '911', fire: '911', medical: '911' },
  'SB': { police: '999', fire: '999', medical: '999' },
  'TO': { police: '117', fire: '118', medical: '8200' },
  'TV': { police: '911', fire: '911', medical: '911' },
  
  // 非洲
  'DZ': { police: '17', fire: '14', medical: '14' },
  'AO': { police: '113', fire: '115', medical: '112' },
  'BJ': { police: '117', fire: '118', medical: '112' },
  'BW': { police: '999', fire: '998', medical: '997' },
  'BF': { police: '17', fire: '18', medical: '18' },
  'BI': { police: '117', fire: '118', medical: '119' },
  'CM': { police: '117', fire: '118', medical: '119' },
  'CV': { police: '132', fire: '131', medical: '130' },
  'TD': { police: '17', fire: '18', medical: '2251-28-56' },
  'KM': { police: '17', fire: '18', medical: '772-00-11' },
  'CG': { police: '112', fire: '112', medical: '112' },
  'CD': { police: '112', fire: '112', medical: '112' },
  'CI': { police: '110/111/170', fire: '180', medical: '185' },
  'DJ': { police: '17', fire: '18', medical: '19' },
  'EG': { police: '122', fire: '180', medical: '123' },
  'GQ': { police: '112', fire: '112', medical: '112' },
  'ER': { police: '113', fire: '114', medical: '116' },
  'ET': { police: '991', fire: '991', medical: '991' },
  'GA': { police: '177', fire: '18', medical: '1300/1212' },
  'GM': { police: '117', fire: '118', medical: '116' },
  'GI': { police: '199', fire: '999', medical: '999' },
  'GH': { police: '191', fire: '192', medical: '193' },
  'GN': { police: '117', fire: '118', medical: '122' },
  'KE': { police: '999', fire: '999', medical: '999' },
  'LS': { police: '123', fire: '122', medical: '121' },
  'LR': { police: '911', fire: '911', medical: '911' },
  'LY': { police: '1515', fire: '1515', medical: '1515' },
  'MG': { police: '117', fire: '118', medical: '124' },
  'ML': { police: '17', fire: '18', medical: '15' },
  'MR': { police: '117', fire: '118', medical: '119' },
  'MU': { police: '999', fire: '995', medical: '999' },
  'MA': { police: '19', fire: '15', medical: '15' },
  'MZ': { police: '119', fire: '198', medical: '117' },
  'NA': { police: '10111', fire: '10177', medical: '10177' },
  'NE': { police: '17', fire: '18', medical: '15' },
  'NG': { police: '112', fire: '112', medical: '112' },
  'RW': { police: '112', fire: '112', medical: '112' },
  'SN': { police: '17', fire: '18', medical: '15' },
  'SC': { police: '999', fire: '999', medical: '999' },
  'SL': { police: '999', fire: '999', medical: '999' },
  'SO': { police: '888', fire: '555', medical: '999' },
  'SS': { police: '999', fire: '999', medical: '999' },
  'SD': { police: '999', fire: '999', medical: '999' },
  'TZ': { police: '112', fire: '112', medical: '112' },
  'TG': { police: '117', fire: '118', medical: '119' },
  'TN': { police: '197', fire: '198', medical: '190' },
  'UG': { police: '999', fire: '999', medical: '999' },
  'ZM': { police: '991', fire: '993', medical: '992' },
  'ZW': { police: '995', fire: '993', medical: '994' },
  'CF': { police: '117', fire: '118', medical: '1220' },
  'GW': { police: '117', fire: '118', medical: '119' },
  'MW': { police: '997', fire: '998', medical: '998' },
  'ST': { police: '112', fire: '112', medical: '112' },
  'SZ': { police: '999', fire: '933', medical: '977' },
  
  // 加勒比海地区
  'AI': { police: '911', fire: '911', medical: '911' },
  'BQ': { police: '911', fire: '911', medical: '911' },
  'GP': { police: '17', fire: '18', medical: '15' },
  'MQ': { police: '17', fire: '18', medical: '15' },
  'HT': { police: '112', fire: '112', medical: '112' },
  'CU': { police: '106', fire: '105', medical: '104' },
};

/**
 * 支付信息映射表
 */
const PAYMENT_INFO_MAP: Record<string, {
  paymentType: 'CASH_HEAVY' | 'BALANCED' | 'DIGITAL_ONLY';
  tipping?: string;
  atm_network?: string;
  wallet_apps?: string[];
  cash_preparation?: string;
}> = {
  'JP': {
    paymentType: 'CASH_HEAVY',
    tipping: '绝对不要给小费，会被视为无礼',
    atm_network: '7-11 ATM支持银联取现',
    wallet_apps: ['Suica (Apple Pay)', 'PayPay', 'LINE Pay'],
    cash_preparation: '硬币使用极高，务必准备零钱袋',
  },
  'KR': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['Kakao Pay', 'Naver Pay', 'Samsung Pay'],
    cash_preparation: '现金使用率低，大部分地方支持刷卡',
  },
  'TH': {
    paymentType: 'BALANCED',
    tipping: '餐厅通常给10-20铢，按摩50-100铢',
    atm_network: '支持银联，手续费较高',
    wallet_apps: ['TrueMoney', 'PromptPay'],
    cash_preparation: '准备小额现金，夜市和街边摊只收现金',
  },
  'SG': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['GrabPay', 'PayNow', 'DBS PayLah!'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'MY': {
    paymentType: 'BALANCED',
    tipping: '不需要小费，但可以给5-10%',
    wallet_apps: ['GrabPay', 'Touch n Go'],
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'US': {
    paymentType: 'BALANCED',
    tipping: '餐厅15-20%，出租车10-15%，酒店$1-2/包',
    atm_network: 'ATM广泛可用，使用本行ATM避免手续费',
    wallet_apps: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    cash_preparation: '准备现金，小费通常给现金',
  },
  'GB': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10-12.5%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'FR': {
    paymentType: 'BALANCED',
    tipping: '餐厅通常已包含服务费，可给5-10%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'DE': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '现金使用率高，很多地方只收现金',
  },
  'AU': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费，但可以给10%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'NZ': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'IN': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，酒店50-100卢比',
    atm_network: '支持银联，但手续费较高',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'BR': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'AR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'AE': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%，酒店5-10迪拉姆',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'SA': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10-15%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'TR': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'CN': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['微信支付', '支付宝', '云闪付'],
    cash_preparation: '现金使用率极低，几乎所有地方支持移动支付',
  },
  'CA': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅15-20%，其他服务10-15%',
    atm_network: '各大银行ATM网络完善',
    wallet_apps: ['Apple Pay', 'Google Pay', 'Samsung Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'IT': {
    paymentType: 'BALANCED',
    tipping: '餐厅通常给1-2欧元，高档餐厅5-10%',
    cash_preparation: '准备现金，很多小店和餐厅只收现金',
  },
  'ES': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常已包含服务费',
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'PT': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常已包含服务费',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'NL': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅通常给5-10%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'CH': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'NO': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['Vipps', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'SE': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['Swish', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'DK': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['MobilePay', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'FI': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['MobilePay', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'PH': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，按摩50-100比索',
    atm_network: '支持银联，手续费较高',
    wallet_apps: ['GCash', 'PayMaya'],
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'VN': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，按摩10-20%',
    wallet_apps: ['MoMo', 'ZaloPay'],
    cash_preparation: '准备小额现金，街边摊只收现金',
  },
  'ID': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常已包含服务费',
    wallet_apps: ['GoPay', 'OVO', 'DANA'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'HK': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10%，通常已包含服务费',
    wallet_apps: ['支付宝HK', '微信支付', 'Octopus八达通'],
    cash_preparation: '现金使用率中等，八达通几乎通用',
  },
  'TW': {
    paymentType: 'BALANCED',
    tipping: '不需要小费',
    wallet_apps: ['LINE Pay', '街口支付', 'Apple Pay'],
    cash_preparation: '准备现金，夜市和小店只收现金',
  },
  'ZA': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%',
    wallet_apps: ['SnapScan', 'Zapper'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'RU': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    wallet_apps: ['SberPay', 'YooMoney'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'MX': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'EG': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10-12%，服务场所需给小费',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'IL': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-12%，通常已包含服务费',
    wallet_apps: ['Bit', 'Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'IE': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10-15%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay', 'Revolut'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'BE': {
    paymentType: 'BALANCED',
    tipping: '餐厅通常给1-2欧元，高档餐厅5-10%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'AT': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '现金使用率高，很多地方只收现金',
  },
  'PL': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    wallet_apps: ['BLIK', 'Apple Pay', 'Google Pay'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'CZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'HU': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'RO': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'GR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '现金使用率高，很多地方只收现金',
  },
  'IS': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'LU': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅5-10%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'CL': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'CO': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'PE': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'CR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'MO': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['MPay', '支付宝', '微信支付'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'KH': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%，按摩1-2美元',
    cash_preparation: '准备美元现金，本地货币瑞尔为辅',
  },
  'LA': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备美元现金，本地货币基普为辅',
  },
  'MM': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备美元现金，本地货币缅元为辅',
  },
  'BD': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'LK': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'NP': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，向导和搬运工需额外小费',
    cash_preparation: '准备美元现金，本地货币尼泊尔卢比为辅',
  },
  'KE': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['M-Pesa'],
    cash_preparation: '准备现金，M-Pesa普及但现金仍需',
  },
  'NG': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Paga', 'Quickteller'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'MA': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，服务场所需给小费',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'TN': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'JO': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'QA': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10-15%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'OM': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'BH': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10-15%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'KZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Kaspi.kz'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'UZ': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'GE': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'AM': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'AZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'UA': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Google Pay', 'Apple Pay'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'BY': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'RS': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常给整数',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'HR': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，通常给整数',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'SI': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅5-10%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'BG': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'SK': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'LT': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅5-10%，通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'LV': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅5-10%',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'EE': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅5-10%，通常已包含服务费',
    wallet_apps: ['Swedbank', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'MT': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，部分小店只收现金',
  },
  'CY': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'FO': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '不需要小费',
    wallet_apps: ['MobilePay', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率极低，几乎所有地方支持刷卡',
  },
  'GL': {
    paymentType: 'BALANCED',
    tipping: '不需要小费',
    cash_preparation: '准备现金，部分地区只收现金',
  },
  'UY': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'PY': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'BO': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'EC': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'VE': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备美元现金，本地货币使用受限',
  },
  'CU': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，刷卡设施有限',
  },
  'DO': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'JM': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'TT': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'BS': {
    paymentType: 'BALANCED',
    tipping: '餐厅15%',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'PA': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'GT': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'HN': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'SV': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'NI': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'BZ': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10-15%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'HT': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'GY': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'SR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'GF': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'GP': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'MQ': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅通常已包含服务费',
    wallet_apps: ['Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  'GH': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['MTN Mobile Money', 'Vodafone Cash'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'TZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['M-Pesa'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'ET': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备大量现金，很多地方只收现金',
  },
  'UG': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['MTN Mobile Money', 'Airtel Money'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'RW': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Mobile Money'],
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'ZM': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Zoona', 'MTN Mobile Money'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'BW': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'NA': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，部分地方只收现金',
  },
  'MU': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'SC': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，旅游区多支持刷卡',
  },
  'MG': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅5-10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'MR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'ML': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'CI': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%',
    wallet_apps: ['Orange Money', 'MTN Mobile Money'],
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'IR': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%，通常已包含服务费',
    cash_preparation: '准备现金，国际信用卡基本不可用',
  },
  'IQ': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'SY': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'LB': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备美元现金，本地货币和美元并行',
  },
  'YE': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅10%',
    cash_preparation: '准备现金，很多地方只收现金',
  },
  'KW': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '餐厅10-15%',
    wallet_apps: ['KNet', 'Apple Pay', 'Google Pay'],
    cash_preparation: '现金使用率低，几乎所有地方支持刷卡',
  },
  
  // 非洲国家
  'DZ': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见，但可用于服务业',
    cash_preparation: '高度依赖现金，银行卡接受度低',
  },
  'AO': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，尤其高档场所',
    cash_preparation: '高度依赖现金，建议备足当地货币',
  },
  'BJ': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，尤其导游或高档服务',
    cash_preparation: '高度依赖现金',
  },
  'BF': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游或酒店服务员',
    cash_preparation: '高度依赖现金',
  },
  'BI': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游或酒店服务员',
    cash_preparation: '高度依赖现金，建议小面额钞票',
  },
  'CM': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金，大城市部分酒店/餐馆接受银行卡',
  },
  'CV': {
    paymentType: 'BALANCED',
    tipping: '餐厅/服务业一般5-10%',
    cash_preparation: '酒店和主要旅游区接受卡，但小店和偏远地区需现金',
  },
  'CF': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'TD': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'CD': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金，美元在某些交易中接受',
  },
  'CG': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'DJ': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，尤其高档场所',
    cash_preparation: '高度依赖现金',
  },
  'GQ': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，尤其高档场所',
    cash_preparation: '高度依赖现金',
  },
  'ER': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金，且货币管制严格',
  },
  'GA': {
    paymentType: 'BALANCED',
    tipping: '偶尔，尤其高档场所',
    cash_preparation: '大城市和酒店接受卡，但小额交易和市场需现金',
  },
  'GM': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅/导游可给小费',
    cash_preparation: '高度依赖现金，建议备小面额',
  },
  'GN': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'GW': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'KM': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'LS': {
    paymentType: 'BALANCED',
    tipping: '餐厅/服务业5-10%',
    cash_preparation: '旅游区接受卡，但偏远地区需现金',
  },
  'LR': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金，美元也常用于交易',
  },
  'LY': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，不常见',
    cash_preparation: '高度依赖现金，银行卡基本不被接受',
  },
  'MW': {
    paymentType: 'CASH_HEAVY',
    tipping: '餐厅/导游可给小费',
    cash_preparation: '高度依赖现金，ATM有限',
  },
  'MZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅/服务业可给小费',
    cash_preparation: '主要城市和酒店接受卡，但市场和偏远地区需现金',
  },
  'NE': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'ST': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'SN': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金，主要城市部分酒店/餐馆接受卡',
  },
  'SL': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'SO': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，不常见',
    cash_preparation: '高度依赖现金',
  },
  'SD': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，不常见',
    cash_preparation: '高度依赖现金',
  },
  'SZ': {
    paymentType: 'BALANCED',
    tipping: '餐厅/服务业10%',
    cash_preparation: '主要旅游区接受卡，但小店和市场需现金',
  },
  'TG': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'ZW': {
    paymentType: 'BALANCED',
    tipping: '餐厅/导游可给小费',
    cash_preparation: '混合支付，美元和当地货币（ZWL）都用，银行卡在主要场所接受',
  },
  
  // 加勒比海国家
  'AG': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%，服务业常见',
    cash_preparation: '旅游区接受卡，但出租车和市场需现金',
  },
  'BB': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%，服务业常见',
    cash_preparation: '旅游区接受卡，但小店和市场需现金',
  },
  'VC': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，服务业常见',
    cash_preparation: '旅游区接受卡，但小店和市场需现金',
  },
  'KN': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%，服务业常见',
    cash_preparation: '旅游区接受卡，但小店和市场需现金',
  },
  'LC': {
    paymentType: 'BALANCED',
    tipping: '餐厅10-15%，服务业常见',
    cash_preparation: '旅游区接受卡，但出租车和市场需现金',
  },
  'GD': {
    paymentType: 'BALANCED',
    tipping: '餐厅10%，服务业常见',
    cash_preparation: '旅游区接受卡，但出租车和市场需现金',
  },
  
  // 亚洲国家
  'BT': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见，可用于导游/司机',
    cash_preparation: '高度依赖现金，银行卡接受度低',
  },
  'BN': {
    paymentType: 'BALANCED',
    tipping: '不常见，可用于高档餐厅',
    cash_preparation: '主要商场/酒店接受卡，小额交易和市场需现金',
  },
  'KG': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '城市接受卡，但偏远地区和市场需现金',
  },
  'KP': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见，外国人通常用欧元/人民币',
    cash_preparation: '外国人支付受限，请遵从当地规定',
  },
  'MV': {
    paymentType: 'BALANCED',
    tipping: '旅游岛屿服务业10%（通常已含服务费）',
    cash_preparation: '旅游度假村接受卡，马累小店需现金',
  },
  'PK': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '主要城市接受卡，但小额交易和市场需现金',
  },
  'TM': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见，可用于导游',
    cash_preparation: '高度依赖现金',
  },
  'TJ': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，可用于导游、司机',
    cash_preparation: '高度依赖现金',
  },
  'TL': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金，使用美元',
  },
  
  // 欧洲国家
  'AD': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '类似西班牙/法国习惯',
    cash_preparation: '信用卡非常普及',
  },
  'AL': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '主要城市和旅游区接受卡，小额交易需现金',
  },
  'BA': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '主要城市和旅游区接受卡，小店/市场需现金',
  },
  'LI': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '类似瑞士习惯，四舍五入或给小额',
    cash_preparation: '信用卡非常普及',
  },
  'MD': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '城市接受卡，但市场和偏远地区需现金',
  },
  'ME': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '旅游区接受卡，但小店和市场需现金',
  },
  'MK': {
    paymentType: 'BALANCED',
    tipping: '餐厅5-10%，服务业常见',
    cash_preparation: '城市接受卡，但市场和偏远地区需现金',
  },
  'VA': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '类似意大利习惯',
    cash_preparation: '信用卡非常普及（注意：银行卡接受度高，但需留意梵蒂冈城内的某些纪念品店/邮局可能只收欧元现金）',
  },
  'SM': {
    paymentType: 'DIGITAL_ONLY',
    tipping: '类似意大利习惯',
    cash_preparation: '信用卡非常普及，现金用于小额交易',
  },
  
  // 大洋洲国家
  'FJ': {
    paymentType: 'BALANCED',
    tipping: '不强制，但可用于服务业/导游',
    cash_preparation: '主要旅游区接受卡，但小店和市场需现金',
  },
  'KI': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'MH': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，不常见',
    cash_preparation: '高度依赖现金，美元是主要货币',
  },
  'FM': {
    paymentType: 'CASH_HEAVY',
    tipping: '偶尔，不常见',
    cash_preparation: '高度依赖现金，使用美元',
  },
  'NR': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'PW': {
    paymentType: 'BALANCED',
    tipping: '潜水/游船导游可给小费',
    cash_preparation: '旅游区接受卡，但小店和出租车需现金，使用美元',
  },
  'PG': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'SB': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'TO': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'TV': {
    paymentType: 'CASH_HEAVY',
    tipping: '不常见',
    cash_preparation: '高度依赖现金',
  },
  'VU': {
    paymentType: 'BALANCED',
    tipping: '不常见，可用于服务业',
    cash_preparation: '维拉港等主要城镇接受卡，偏远地区需现金',
  },
  'WS': {
    paymentType: 'BALANCED',
    tipping: '不常见，可用于服务业',
    cash_preparation: '首都和酒店接受卡，但小店和市场需现金',
  },
};

/**
 * 翻译签证状态为中文
 */
function translateVisaStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'VISA_FREE': '免签',
    'VISA_REQUIRED': '需要签证',
    'VISA_ON_ARRIVAL': '落地签',
    'E_VISA': '电子签',
    'E_TA': '电子旅行许可',
  };
  return statusMap[status] || status;
}

/**
 * 翻译签证要求为中文
 */
function translateVisaRequirement(requirement: string): string {
  const requirementMap: Record<string, string> = {
    'Visa not required': '免签',
    'Visa required': '需要签证',
    'Visa on arrival': '落地签',
    'Electronic Travel Authorization': '电子旅行许可',
    'Electronic visa': '电子签',
  };
  return requirementMap[requirement] || requirement;
}

/**
 * 翻译签证备注为中文（改进版）
 */
function translateVisaNotes(notes: string | null): string | null {
  if (!notes) return null;
  
  let translated = notes;
  
  // 翻译常见短语和模式
  const translations: Array<[RegExp, string]> = [
    // 时间相关
    [/\b(\d+)\s*days?\s*within\s*any\s*(\d+)\s*day\s*period/gi, '$1天内，每$2天周期'],
    [/\b(\d+)\s*days?\s*at\s*a\s*time/gi, '每次$1天'],
    [/\bno\s*more\s*than\s*(\d+)\s*days?/gi, '不超过$1天'],
    [/\bwithin\s*any\s*(\d+)\s*days?/gi, '在任意$1天内'],
    [/\b(\d+)\s*days?/gi, '$1天'],
    [/\b(\d+)\s*months?/gi, '$1个月'],
    [/\b(\d+)\s*years?/gi, '$1年'],
    
    // 目的相关
    [/tourism\s*purposes?/gi, '旅游目的'],
    [/business\s*purposes?/gi, '商务目的'],
    [/transit\s*purposes?/gi, '过境目的'],
    
    // 文件相关
    [/return\/onward\s*ticket/gi, '返程/续程机票'],
    [/hotel\s*reservation/gi, '酒店预订'],
    [/valid\s*passport/gi, '有效护照'],
    [/passport\s*holders?/gi, '护照持有者'],
    [/Chinese\s*citizens?/gi, '中国公民'],
    
    // 动作相关
    [/must\s*be\s*approved\s*before\s*travel/gi, '必须在旅行前获得批准'],
    [/apply\s*online/gi, '在线申请'],
    [/issued\s*for/gi, '有效期'],
    [/validity\s*period/gi, '有效期'],
    [/obtain\s*visa/gi, '获得签证'],
    [/require\s*a\s*visa/gi, '需要签证'],
    
    // 其他常见短语
    [/electronic\s*travel\s*authorization/gi, '电子旅行许可'],
    [/visa\s*on\s*arrival/gi, '落地签'],
    [/electronic\s*visa/gi, '电子签'],
    [/double\s*entry/gi, '两次入境'],
    [/multiple\s*entry/gi, '多次入境'],
    [/single\s*entry/gi, '单次入境'],
  ];
  
  // 按顺序替换
  for (const [pattern, replacement] of translations) {
    translated = translated.replace(pattern, replacement);
  }
  
  // 清理多余空格
  translated = translated.replace(/\s+/g, ' ').trim();
  
  return translated;
}

/**
 * 优化签证信息（转换为中文）
 */
function optimizeVisaInfo(visaData: any): any {
  if (!visaData) return null;
  
  const optimized: any = {};
  
  // 翻译status
  if (visaData.status) {
    optimized.status = visaData.status; // 保留原始值用于逻辑判断
    optimized.statusCN = translateVisaStatus(visaData.status);
  }
  
  // 翻译requirement
  if (visaData.requirement) {
    optimized.requirement = visaData.requirement; // 保留原始值
    optimized.requirementCN = translateVisaRequirement(visaData.requirement);
  }
  
  // 翻译allowedStay
  if (visaData.allowedStay) {
    optimized.allowedStay = visaData.allowedStay;
    // 将 "90 days" 转换为 "90天"
    optimized.allowedStayCN = visaData.allowedStay.replace(/days?/gi, '天').replace(/\s+/g, '');
  }
  
  // 翻译notes
  if (visaData.notes) {
    optimized.notes = visaData.notes; // 保留原始英文
    optimized.notesCN = translateVisaNotes(visaData.notes);
  }
  
  // 保留其他字段
  Object.keys(visaData).forEach(key => {
    if (!['status', 'requirement', 'allowedStay', 'notes'].includes(key)) {
      optimized[key] = visaData[key];
    }
  });
  
  return optimized;
}

/**
 * 优化国家档案数据
 */
async function optimizeCountryProfiles() {
  console.log('🚀 开始优化国家档案数据...\n');

  // 获取所有国家
  const allCountries = await prisma.countryProfile.findMany({
    orderBy: { isoCode: 'asc' },
  });

  console.log(`📊 找到 ${allCountries.length} 个国家\n`);
  console.log('━'.repeat(60));

  let updatedCount = 0;
  let nameFixedCount = 0;
  let nameENAddedCount = 0;
  let currencyAddedCount = 0;
  let powerInfoAddedCount = 0;
  let emergencyAddedCount = 0;
  let paymentInfoAddedCount = 0;
  let visaInfoUpdatedCount = 0;
  let exchangeRateToUSDAddedCount = 0;

  for (const country of allCountries) {
    const updates: any = {};
    let hasUpdate = false;

    // 1. 标准化国家名称（统一使用中文，并添加英文名称）
    try {
      const chineseName = countries.getName(country.isoCode, 'zh', { select: 'official' });
      const englishName = countries.getName(country.isoCode, 'en', { select: 'official' });
      
      if (chineseName) {
        // 检查当前名称是否是英文（包含英文字母且不是中文）
        const hasEnglish = /^[A-Za-z\s]+$/.test(country.nameCN.trim());
        const isDifferent = chineseName !== country.nameCN;
        
        if (hasEnglish || (isDifferent && !country.nameCN.includes(chineseName))) {
          updates.nameCN = chineseName;
          hasUpdate = true;
          nameFixedCount++;
          console.log(`✅ [${country.isoCode}] 名称更新: "${country.nameCN}" → "${chineseName}"`);
        }
      }
      
      // 填充英文名称（如果缺失）
      if (englishName && !country.nameEN) {
        updates.nameEN = englishName;
        hasUpdate = true;
        nameENAddedCount++;
        console.log(`🌍 [${country.isoCode}] 添加英文名称: "${englishName}"`);
      }
    } catch (error) {
      // 如果获取名称失败，跳过
    }

    // 2. 填充货币信息（如果缺失）
    if (!country.currencyCode && COUNTRY_CURRENCY_MAP[country.isoCode]) {
      const currency = COUNTRY_CURRENCY_MAP[country.isoCode];
      updates.currencyCode = currency.code;
      updates.currencyName = currency.name;
      hasUpdate = true;
      currencyAddedCount++;
      console.log(`💰 [${country.isoCode}] 添加货币: ${currency.code} (${currency.name})`);
    }

    // 3. 填充插座信息（如果缺失）
    if (country.powerInfo === null && POWER_INFO_MAP[country.isoCode]) {
      const powerInfo = POWER_INFO_MAP[country.isoCode];
      updates.powerInfo = {
        voltage: powerInfo.voltage,
        frequency: powerInfo.frequency,
        plugTypes: powerInfo.plugTypes,
        note: `电压: ${powerInfo.voltage}V, 频率: ${powerInfo.frequency}Hz, 插座类型: ${powerInfo.plugTypes.join(', ')}`,
      };
      hasUpdate = true;
      powerInfoAddedCount++;
      console.log(`🔌 [${country.isoCode}] 添加插座信息: ${powerInfo.voltage}V/${powerInfo.frequency}Hz (${powerInfo.plugTypes.join(', ')})`);
    }

    // 4. 填充紧急电话（如果缺失）
    if (country.emergency === null && EMERGENCY_MAP[country.isoCode]) {
      const emergency = EMERGENCY_MAP[country.isoCode];
      updates.emergency = {
        police: emergency.police,
        fire: emergency.fire,
        medical: emergency.medical,
        note: `报警: ${emergency.police}, 火警: ${emergency.fire}, 医疗: ${emergency.medical}`,
      };
      hasUpdate = true;
      emergencyAddedCount++;
      console.log(`🚨 [${country.isoCode}] 添加紧急电话: 报警${emergency.police}/火警${emergency.fire}/医疗${emergency.medical}`);
    }

    // 5. 填充支付信息（如果缺失或需要更新）
    if (PAYMENT_INFO_MAP[country.isoCode]) {
      const existingPaymentInfo = country.paymentInfo as any;
      const newPaymentInfo = PAYMENT_INFO_MAP[country.isoCode];
      
      // 如果支付信息为空，或者需要强制更新（新数据覆盖旧数据）
      const shouldUpdate = !existingPaymentInfo || 
          !existingPaymentInfo.tipping || 
          !existingPaymentInfo.wallet_apps ||
          // 强制更新：如果 paymentType 不匹配，说明需要更新
          (country.paymentType !== newPaymentInfo.paymentType);
      
      if (shouldUpdate) {
        updates.paymentInfo = {
          ...(existingPaymentInfo || {}),
          tipping: newPaymentInfo.tipping,
          atm_network: newPaymentInfo.atm_network || existingPaymentInfo?.atm_network,
          wallet_apps: newPaymentInfo.wallet_apps,
          cash_preparation: newPaymentInfo.cash_preparation,
        };
        // 同时更新paymentType
        updates.paymentType = newPaymentInfo.paymentType;
        hasUpdate = true;
        paymentInfoAddedCount++;
        console.log(`💳 [${country.isoCode}] ${existingPaymentInfo ? '更新' : '添加'}支付信息: ${newPaymentInfo.paymentType}`);
      }
    }

    // 6. 优化签证信息（转换为中文）
    if (country.visaForCN) {
      const visaData = country.visaForCN as any;
      // 检查是否已经有中文字段
      if (!visaData.statusCN && !visaData.requirementCN) {
        const optimizedVisa = optimizeVisaInfo(visaData);
        if (optimizedVisa && JSON.stringify(optimizedVisa) !== JSON.stringify(visaData)) {
          updates.visaForCN = optimizedVisa;
          hasUpdate = true;
          visaInfoUpdatedCount++;
          console.log(`🛂 [${country.isoCode}] 优化签证信息: ${visaData.status || 'N/A'} → ${optimizedVisa.statusCN || 'N/A'}`);
        }
      }
    }

    // 7. 计算并填充 exchangeRateToUSD（如果缺失）
    // 如果已有 exchangeRateToCNY，可以通过 USD/CNY 汇率计算 exchangeRateToUSD
    if (!country.exchangeRateToUSD && country.exchangeRateToCNY && country.currencyCode) {
      // 获取 USD/CNY 汇率（1 USD = 多少 CNY）
      // 这里使用一个近似值 7.2，实际应该从 API 获取或从数据库中的 US 国家记录获取
      // 如果 currencyCode 是 USD，则 exchangeRateToUSD = 1
      if (country.currencyCode === 'USD') {
        updates.exchangeRateToUSD = 1.0;
        hasUpdate = true;
        exchangeRateToUSDAddedCount++;
        console.log(`💵 [${country.isoCode}] 添加USD汇率: 1.0 (USD本身)`);
      } else {
        // 尝试从 US 国家记录获取 USD/CNY 汇率
        try {
          const usCountry = await prisma.countryProfile.findUnique({
            where: { isoCode: 'US' },
            select: { exchangeRateToCNY: true },
          });
          
          if (usCountry?.exchangeRateToCNY) {
            // USD/CNY = 1 / exchangeRateToCNY (US)
            // 例如：如果 1 USD = 7.2 CNY，则 exchangeRateToCNY (US) = 7.2
            const usdToCny = usCountry.exchangeRateToCNY;
            // exchangeRateToUSD = exchangeRateToCNY / usdToCny
            // 例如：如果 1 JPY = 0.0483 CNY，且 1 USD = 7.2 CNY
            // 则 1 JPY = 0.0483 / 7.2 = 0.0067 USD
            const rateToUSD = country.exchangeRateToCNY / usdToCny;
            updates.exchangeRateToUSD = rateToUSD;
            hasUpdate = true;
            exchangeRateToUSDAddedCount++;
            console.log(`💵 [${country.isoCode}] 添加USD汇率: ${rateToUSD.toFixed(6)} (通过CNY汇率计算)`);
          }
        } catch (error) {
          // 如果获取失败，跳过
        }
      }
    }

    // 8. 更新updatedAt
    if (hasUpdate) {
      updates.updatedAt = new Date();
      await prisma.countryProfile.update({
        where: { isoCode: country.isoCode },
        data: updates,
      });
      updatedCount++;
      // 注意：计数已经在各自的条件块中完成，这里不需要重复计数
    }
  }

  console.log('\n' + '━'.repeat(60));
  console.log('📊 优化统计:');
  console.log(`   总国家数: ${allCountries.length}`);
  console.log(`   更新记录数: ${updatedCount}`);
  console.log(`   名称修正: ${nameFixedCount}`);
  console.log(`   英文名称添加: ${nameENAddedCount}`);
  console.log(`   货币添加: ${currencyAddedCount}`);
  console.log(`   插座信息添加: ${powerInfoAddedCount}`);
  console.log(`   紧急电话添加: ${emergencyAddedCount}`);
  console.log(`   支付信息添加: ${paymentInfoAddedCount}`);
  console.log(`   签证信息优化: ${visaInfoUpdatedCount}`);
  console.log(`   USD汇率添加: ${exchangeRateToUSDAddedCount}`);
  console.log('━'.repeat(60));

  // 显示优化后的统计
  const withCurrency = await prisma.countryProfile.count({
    where: { currencyCode: { not: null } },
  });
  const withPowerInfo = await prisma.countryProfile.count({
    where: { powerInfo: { not: null } },
  });
  const withEmergency = await prisma.countryProfile.count({
    where: { emergency: { not: null } },
  });
  const withPaymentInfo = await prisma.countryProfile.count({
    where: { paymentInfo: { not: null } },
  });
  const withVisaInfo = await prisma.countryProfile.count({
    where: { visaForCN: { not: null } },
  });
  
  // 检查中文名称（简单检查：不全是英文字母）
  const allCountriesAfter = await prisma.countryProfile.findMany({
    select: { nameCN: true },
  });
  const withChineseName = allCountriesAfter.filter(c => {
    // 检查是否包含中文字符
    return /[\u4e00-\u9fa5]/.test(c.nameCN);
  }).length;

  console.log('\n📈 优化后统计:');
  console.log(`   中文名称: ${withChineseName} (${Math.round((withChineseName / allCountries.length) * 100)}%)`);
  console.log(`   有货币代码: ${withCurrency} (${Math.round((withCurrency / allCountries.length) * 100)}%)`);
  console.log(`   有插座信息: ${withPowerInfo} (${Math.round((withPowerInfo / allCountries.length) * 100)}%)`);
  console.log(`   有紧急电话: ${withEmergency} (${Math.round((withEmergency / allCountries.length) * 100)}%)`);
  console.log(`   有支付信息: ${withPaymentInfo} (${Math.round((withPaymentInfo / allCountries.length) * 100)}%)`);
  console.log(`   有签证信息: ${withVisaInfo} (${Math.round((withVisaInfo / allCountries.length) * 100)}%)`);
}

async function main() {
  try {
    await optimizeCountryProfiles();
  } catch (error: any) {
    console.error('❌ 优化失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
