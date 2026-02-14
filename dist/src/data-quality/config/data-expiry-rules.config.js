"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPIRY_RULES = void 0;
exports.isDataExpired = isDataExpired;
exports.EXPIRY_RULES = {
    DEM: {
        checkIntegrity: true,
        alertOnMissing: true,
    },
    GEOGRAPHIC_FEATURES: {
        RIVERS: {
            expiryDays: 365,
            checkIntegrity: true,
            alertOnMissing: true,
        },
        MOUNTAINS: {
            expiryDays: 365,
            checkIntegrity: true,
            alertOnMissing: true,
        },
        ROADS: {
            expiryDays: 90,
            checkIntegrity: true,
            alertOnMissing: true,
        },
        COASTLINES: {
            expiryDays: 365,
            checkIntegrity: true,
            alertOnMissing: true,
        },
        PORTS: {
            expiryDays: 90,
            checkIntegrity: true,
            alertOnMissing: true,
        },
        RAILWAYS: {
            expiryDays: 180,
            checkIntegrity: true,
            alertOnMissing: true,
        },
    },
    ROAD_STATUS: {
        expiryDays: 1,
        checkIntegrity: true,
        alertOnMissing: true,
    },
    FERRY_SCHEDULES: {
        expiryDays: 7,
        checkIntegrity: true,
        alertOnMissing: true,
    },
    WEATHER_WINDOWS: {
        expiryDays: 1,
        checkIntegrity: true,
        alertOnMissing: true,
    },
};
function isDataExpired(lastUpdated, expiryDays) {
    if (!expiryDays) {
        return false;
    }
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > expiryDays;
}
//# sourceMappingURL=data-expiry-rules.config.js.map