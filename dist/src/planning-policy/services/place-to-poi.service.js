"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceToPoiService = void 0;
exports.createPlaceQueryWithLatLng = createPlaceQueryWithLatLng;
const common_1 = require("@nestjs/common");
let PlaceToPoiService = class PlaceToPoiService {
    extractLatLng(place) {
        if (place.lat !== undefined && place.lng !== undefined) {
            return { lat: place.lat, lng: place.lng };
        }
        console.warn(`Place ${place.id}: location not extracted, using default (0, 0). Please extract lat/lng in SQL query.`);
        return { lat: 0, lng: 0 };
    }
    convert(place) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        const metadata = place.metadata || {};
        const physicalMetadata = place.physicalMetadata || {};
        const { lat, lng } = this.extractLatLng(place);
        const openingHours = this.convertOpeningHours(metadata.openingHours);
        const estimatedDurationMin = (_b = (_a = physicalMetadata.estimated_duration_min) !== null && _a !== void 0 ? _a : physicalMetadata.visitDurationMin) !== null && _b !== void 0 ? _b : 120;
        const visitMinStd = (_d = (_c = physicalMetadata.visit_std_min) !== null && _c !== void 0 ? _c : physicalMetadata.visitMinStd) !== null && _d !== void 0 ? _d : estimatedDurationMin * 0.25;
        const queueMinMean = (_f = (_e = physicalMetadata.queue_mean_min) !== null && _e !== void 0 ? _e : physicalMetadata.queueMinMean) !== null && _f !== void 0 ? _f : 0;
        const queueMinStd = (_h = (_g = physicalMetadata.queue_std_min) !== null && _g !== void 0 ? _g : physicalMetadata.queueMinStd) !== null && _h !== void 0 ? _h : (queueMinMean > 0 ? queueMinMean * 0.35 : 0);
        const wheelchairAccess = (_l = (_k = (_j = physicalMetadata.wheelchair_access) !== null && _j !== void 0 ? _j : physicalMetadata.wheelchairAccess) !== null && _k !== void 0 ? _k : metadata.wheelchairAccessible) !== null && _l !== void 0 ? _l : false;
        const stairsRequired = (_p = (_o = (_m = physicalMetadata.stairs_required) !== null && _m !== void 0 ? _m : physicalMetadata.stairsRequired) !== null && _o !== void 0 ? _o : (physicalMetadata.terrain_type === 'STAIRS_ONLY' ||
            physicalMetadata.terrain_type === 'HILLY')) !== null && _p !== void 0 ? _p : false;
        const seatingAvailable = (_s = (_r = (_q = physicalMetadata.seating_available) !== null && _q !== void 0 ? _q : physicalMetadata.seatingAvailable) !== null && _r !== void 0 ? _r : (physicalMetadata.seated_ratio !== undefined &&
            physicalMetadata.seated_ratio > 0.5)) !== null && _s !== void 0 ? _s : false;
        const restroomNearby = (_v = (_u = (_t = physicalMetadata.restroom_nearby) !== null && _t !== void 0 ? _t : physicalMetadata.restroomNearby) !== null && _u !== void 0 ? _u : metadata.restroomNearby) !== null && _v !== void 0 ? _v : false;
        const weatherSensitivity = this.parseWeatherSensitivity((_w = metadata.weatherSensitivity) !== null && _w !== void 0 ? _w : physicalMetadata.weather_sensitivity);
        const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
        return {
            id: place.id.toString(),
            name: place.nameCN || place.nameEN || 'Unknown',
            lat,
            lng,
            tags,
            openingHours,
            avgVisitMin: estimatedDurationMin,
            visitMinStd,
            queueMinMean,
            queueMinStd,
            wheelchairAccess,
            stairsRequired,
            seatingAvailable,
            restroomNearby,
            weatherSensitivity,
            crowdKey: metadata.crowdKey || undefined,
        };
    }
    convertOpeningHours(raw) {
        if (!raw)
            return undefined;
        if (raw.windows && Array.isArray(raw.windows)) {
            return raw;
        }
        if (typeof raw === 'object' && !Array.isArray(raw.windows)) {
            const windows = [];
            const dayMap = {
                sun: 0,
                mon: 1,
                tue: 2,
                wed: 3,
                thu: 4,
                fri: 5,
                sat: 6,
            };
            for (const [key, value] of Object.entries(raw)) {
                if (key in dayMap && typeof value === 'string') {
                    const [start, end] = value.split('-');
                    if (start && end) {
                        windows.push({
                            dayOfWeek: dayMap[key],
                            start: start.trim(),
                            end: end.trim(),
                        });
                    }
                }
            }
            if (windows.length > 0) {
                return {
                    windows,
                    lastEntry: raw.lastEntry,
                    lastEntryByDay: raw.lastEntryByDay,
                    closedDates: raw.closedDates,
                    timezone: raw.timezone,
                };
            }
        }
        console.warn('无法转换 openingHours 格式:', raw);
        return undefined;
    }
    parseWeatherSensitivity(value) {
        if (value === undefined || value === null)
            return undefined;
        if (typeof value === 'number') {
            if (value >= 0 && value <= 3) {
                return value;
            }
        }
        if (typeof value === 'string') {
            const normalized = value.toLowerCase().trim();
            if (normalized === 'none' || normalized === '0')
                return 0;
            if (normalized === 'low' || normalized === '1')
                return 1;
            if (normalized === 'medium' || normalized === '2')
                return 2;
            if (normalized === 'high' || normalized === '3')
                return 3;
        }
        return undefined;
    }
    convertBatch(places) {
        return places.map((place) => this.convert(place));
    }
};
exports.PlaceToPoiService = PlaceToPoiService;
exports.PlaceToPoiService = PlaceToPoiService = __decorate([
    (0, common_1.Injectable)()
], PlaceToPoiService);
function createPlaceQueryWithLatLng(placeIds) {
    return `
    SELECT 
      p.*,
      ST_Y(p.location::geometry) AS lat,
      ST_X(p.location::geometry) AS lng
    FROM "Place" p
    WHERE p.id IN (${placeIds.join(',')})
  `;
}
//# sourceMappingURL=place-to-poi.service.js.map