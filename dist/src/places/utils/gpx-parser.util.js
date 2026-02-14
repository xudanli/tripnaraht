"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GPXParser = void 0;
class GPXParser {
    static parse(gpxXml) {
        const points = [];
        const pointRegex = /<(?:trkpt|wpt)\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|wpt)>/gi;
        let match;
        while ((match = pointRegex.exec(gpxXml)) !== null) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            const content = match[3];
            const eleMatch = content.match(/<ele>([^<]+)<\/ele>/i);
            const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;
            const timeMatch = content.match(/<time>([^<]+)<\/time>/i);
            const time = timeMatch ? new Date(timeMatch[1]) : undefined;
            points.push({
                lat,
                lng,
                elevation,
                time,
            });
        }
        if (points.length === 0) {
            throw new Error('GPX 文件中未找到轨迹点');
        }
        return points;
    }
    static async parseFromFile(filePath) {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        const gpxXml = await fs.readFile(filePath, 'utf-8');
        return this.parse(gpxXml);
    }
    static async parseFromURL(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch GPX from ${url}: ${response.statusText}`);
        }
        const gpxXml = await response.text();
        return this.parse(gpxXml);
    }
}
exports.GPXParser = GPXParser;
//# sourceMappingURL=gpx-parser.util.js.map