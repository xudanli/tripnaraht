"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataEnricher = void 0;
const osm_opening_hours_parser_util_1 = require("../../common/utils/osm-opening-hours-parser.util");
class MetadataEnricher {
    static enrich(metadata) {
        const enriched = { ...metadata };
        if (!enriched.openingHours) {
            const osmHours = this.extractOsmOpeningHours(metadata);
            if (osmHours) {
                const parsed = osm_opening_hours_parser_util_1.OsmOpeningHoursParser.parse(osmHours);
                if (parsed) {
                    enriched.openingHours = parsed;
                }
            }
        }
        if (!enriched.business_status) {
        }
        return enriched;
    }
    static extractOsmOpeningHours(metadata) {
        var _a, _b;
        if (!metadata)
            return null;
        if ((_a = metadata.rawTags) === null || _a === void 0 ? void 0 : _a.opening_hours) {
            return metadata.rawTags.opening_hours;
        }
        if (metadata.opening_hours) {
            return metadata.opening_hours;
        }
        if ((_b = metadata.openingHours) === null || _b === void 0 ? void 0 : _b.osmFormat) {
            return metadata.openingHours.osmFormat;
        }
        return null;
    }
    static merge(oldMetadata, newMetadata) {
        const merged = {
            ...oldMetadata,
            ...newMetadata,
        };
        if ((oldMetadata === null || oldMetadata === void 0 ? void 0 : oldMetadata.openingHours) && (newMetadata === null || newMetadata === void 0 ? void 0 : newMetadata.openingHours)) {
            merged.openingHours = {
                ...oldMetadata.openingHours,
                ...newMetadata.openingHours,
            };
        }
        return merged;
    }
}
exports.MetadataEnricher = MetadataEnricher;
//# sourceMappingURL=metadata-enricher.util.js.map