"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADD_KEYWORDS = exports.QUERY_KEYWORDS = exports.KEYWORD_TO_GAP_TYPE = exports.DEFAULT_GAP_ANALYSIS_CONFIG = exports.IntentUncertainty = void 0;
var IntentUncertainty;
(function (IntentUncertainty) {
    IntentUncertainty["CLEAR"] = "CLEAR";
    IntentUncertainty["AMBIGUOUS_ACTION"] = "AMBIGUOUS_ACTION";
    IntentUncertainty["AMBIGUOUS_TARGET"] = "AMBIGUOUS_TARGET";
    IntentUncertainty["AMBIGUOUS_NEED"] = "AMBIGUOUS_NEED";
    IntentUncertainty["MULTIPLE_INTENTS"] = "MULTIPLE_INTENTS";
})(IntentUncertainty || (exports.IntentUncertainty = IntentUncertainty = {}));
exports.DEFAULT_GAP_ANALYSIS_CONFIG = {
    detectMealGaps: true,
    detectActivityGaps: true,
    detectTransportGaps: true,
    detectHotelGaps: true,
    mealWindows: [
        { name: '早餐', start: '07:00', end: '09:30', required: false },
        { name: '午餐', start: '11:30', end: '14:00', required: true },
        { name: '晚餐', start: '17:30', end: '20:30', required: true },
    ],
    minFreeTimeForGap: 120,
    minActivityBuffer: 30,
};
exports.KEYWORD_TO_GAP_TYPE = {
    '餐厅': 'MEAL',
    '吃饭': 'MEAL',
    '美食': 'MEAL',
    '午餐': 'MEAL',
    '晚餐': 'MEAL',
    '早餐': 'MEAL',
    '吃什么': 'MEAL',
    '好吃': 'MEAL',
    '酒店': 'HOTEL',
    '住宿': 'HOTEL',
    '住哪': 'HOTEL',
    '民宿': 'HOTEL',
    '宾馆': 'HOTEL',
    '交通': 'TRANSPORT',
    '怎么去': 'TRANSPORT',
    '坐什么': 'TRANSPORT',
    '地铁': 'TRANSPORT',
    '公交': 'TRANSPORT',
    '打车': 'TRANSPORT',
    '景点': 'ACTIVITY',
    '玩什么': 'ACTIVITY',
    '去哪': 'ACTIVITY',
    '逛': 'ACTIVITY',
    '看': 'ACTIVITY',
};
exports.QUERY_KEYWORDS = [
    '有什么',
    '推荐',
    '介绍',
    '哪里有',
    '什么好吃',
    '哪家好',
    '有哪些',
    '了解',
    '告诉我',
    '说说',
];
exports.ADD_KEYWORDS = [
    '加到',
    '安排',
    '帮我订',
    '放到',
    '加入行程',
    '加进去',
    '添加',
    '规划',
    '帮我加',
    '帮我安排',
];
//# sourceMappingURL=intent-uncertainty.interface.js.map