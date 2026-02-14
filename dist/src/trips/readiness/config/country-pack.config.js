"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTRY_PACKS = void 0;
exports.getCountryPack = getCountryPack;
exports.COUNTRY_PACKS = {
    CN_XIZANG: {
        countryCode: 'CN_XIZANG',
        countryName: '中国西藏',
        riskThresholds: {
            highAltitudeM: 3500,
            rapidAscentM: 500,
            steepSlopePct: 15,
            bigAscentDayM: 1500,
        },
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
    CN_SICHUAN: {
        countryCode: 'CN_SICHUAN',
        countryName: '中国四川',
        riskThresholds: {
            highAltitudeM: 3000,
            rapidAscentM: 400,
            steepSlopePct: 12,
            bigAscentDayM: 1200,
        },
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
    NP: {
        countryCode: 'NP',
        countryName: '尼泊尔',
        riskThresholds: {
            highAltitudeM: 3500,
            rapidAscentM: 400,
            steepSlopePct: 12,
            bigAscentDayM: 1200,
        },
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
    NZ: {
        countryCode: 'NZ',
        countryName: '新西兰',
        riskThresholds: {
            highAltitudeM: 2000,
            rapidAscentM: 600,
            steepSlopePct: 20,
            bigAscentDayM: 1500,
        },
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
    IS: {
        countryCode: 'IS',
        countryName: '冰岛',
        riskThresholds: {
            highAltitudeM: 1800,
            rapidAscentM: 500,
            steepSlopePct: 18,
            bigAscentDayM: 1200,
        },
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
    GLOBAL: {
        countryCode: 'GLOBAL',
        countryName: '全球默认',
        effortLevelMapping: {
            relaxMax: 30,
            moderateMax: 60,
            challengeMax: 85,
            extremeMin: 85,
        },
    },
};
function getCountryPack(countryCode) {
    return exports.COUNTRY_PACKS[countryCode] || exports.COUNTRY_PACKS.GLOBAL;
}
//# sourceMappingURL=country-pack.config.js.map