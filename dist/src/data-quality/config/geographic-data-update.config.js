"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEOGRAPHIC_DATA_UPDATE_CONFIG = exports.UpdateFrequency = void 0;
exports.getFrequencyMs = getFrequencyMs;
exports.shouldUpdate = shouldUpdate;
var UpdateFrequency;
(function (UpdateFrequency) {
    UpdateFrequency["DAILY"] = "DAILY";
    UpdateFrequency["WEEKLY"] = "WEEKLY";
    UpdateFrequency["MONTHLY"] = "MONTHLY";
    UpdateFrequency["QUARTERLY"] = "QUARTERLY";
    UpdateFrequency["YEARLY"] = "YEARLY";
})(UpdateFrequency || (exports.UpdateFrequency = UpdateFrequency = {}));
exports.GEOGRAPHIC_DATA_UPDATE_CONFIG = {
    DEM: {
        frequency: UpdateFrequency.YEARLY,
        monitorIntegrity: true,
        alertOnMissing: true,
    },
    GEOGRAPHIC_FEATURES: {
        frequency: UpdateFrequency.QUARTERLY,
        monitorIntegrity: true,
        alertOnMissing: true,
        types: ['RIVERS', 'MOUNTAINS', 'ROADS', 'COASTLINES', 'PORTS', 'RAILWAYS'],
    },
    OSM: {
        frequency: UpdateFrequency.WEEKLY,
        monitorIntegrity: true,
        alertOnMissing: false,
    },
};
function getFrequencyMs(frequency) {
    const msPerDay = 24 * 60 * 60 * 1000;
    switch (frequency) {
        case UpdateFrequency.DAILY:
            return msPerDay;
        case UpdateFrequency.WEEKLY:
            return msPerDay * 7;
        case UpdateFrequency.MONTHLY:
            return msPerDay * 30;
        case UpdateFrequency.QUARTERLY:
            return msPerDay * 90;
        case UpdateFrequency.YEARLY:
            return msPerDay * 365;
        default:
            return msPerDay;
    }
}
function shouldUpdate(lastUpdated, frequency) {
    const now = new Date();
    const timeSinceUpdate = now.getTime() - lastUpdated.getTime();
    const frequencyMs = getFrequencyMs(frequency);
    return timeSinceUpdate >= frequencyMs;
}
//# sourceMappingURL=geographic-data-update.config.js.map