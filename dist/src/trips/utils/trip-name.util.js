"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDestinationName = getDestinationName;
exports.generateDefaultTripName = generateDefaultTripName;
function getDestinationName(countryCode) {
    const countryNames = {
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
    return countryNames[countryCode === null || countryCode === void 0 ? void 0 : countryCode.toUpperCase()] || countryCode || '未知目的地';
}
function generateDefaultTripName(params) {
    const destinationName = getDestinationName(params.destination);
    let dateStr;
    if (params.startDate instanceof Date) {
        dateStr = params.startDate.toISOString().split('T')[0];
    }
    else {
        dateStr = params.startDate.split('T')[0];
    }
    return `${destinationName} ${dateStr}`;
}
//# sourceMappingURL=trip-name.util.js.map