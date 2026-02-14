"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockPoiProvider = void 0;
const common_1 = require("@nestjs/common");
let MockPoiProvider = class MockPoiProvider {
    async textSearch(args) {
        const { query, lat, lng } = args;
        const queryLower = query.toLowerCase();
        const mockPois = [
            {
                id: 'mock-1',
                name: '东京塔',
                nameCN: '东京塔',
                nameEN: 'Tokyo Tower',
                lat: 35.6586,
                lng: 139.7454,
                distanceM: 500,
                rating: 4.5,
                isOpenNow: true,
                address: '港区芝公园4-2-8',
                tags: ['landmark', 'tower', 'observation'],
            },
            {
                id: 'mock-2',
                name: '浅草寺',
                nameCN: '浅草寺',
                nameEN: 'Senso-ji Temple',
                lat: 35.7148,
                lng: 139.7967,
                distanceM: 1200,
                rating: 4.7,
                isOpenNow: true,
                address: '台东区浅草2-3-1',
                tags: ['temple', 'landmark', 'culture'],
            },
            {
                id: 'mock-3',
                name: '银座拉面店',
                nameCN: '银座拉面店',
                nameEN: 'Ginza Ramen',
                lat: 35.6719,
                lng: 139.7659,
                distanceM: 800,
                rating: 4.3,
                isOpenNow: true,
                address: '中央区银座3-5-1',
                tags: ['restaurant', 'ramen', 'food'],
            },
        ];
        const matched = mockPois.filter((poi) => {
            const searchText = `${poi.name} ${poi.nameEN || ''} ${poi.nameCN || ''}`.toLowerCase();
            return searchText.includes(queryLower) || queryLower.includes(poi.name.toLowerCase());
        });
        if (matched.length === 0) {
            return mockPois.slice(0, 3).map((poi) => ({
                ...poi,
                distanceM: Math.floor(Math.random() * 2000) + 200,
                matchScore: 0.5,
            }));
        }
        return matched.map((poi) => {
            const searchText = `${poi.name} ${poi.nameEN || ''}`.toLowerCase();
            let matchScore = 0.5;
            if (searchText.startsWith(queryLower)) {
                matchScore = 0.9;
            }
            else if (searchText.includes(queryLower)) {
                matchScore = 0.7;
            }
            return {
                ...poi,
                matchScore,
            };
        });
    }
    async nearbySearch(args) {
        return this.textSearch({
            query: args.keyword || args.type || '',
            lat: args.lat,
            lng: args.lng,
            radiusM: args.radiusM,
            language: args.language,
            types: args.type ? [args.type] : undefined,
        });
    }
};
exports.MockPoiProvider = MockPoiProvider;
exports.MockPoiProvider = MockPoiProvider = __decorate([
    (0, common_1.Injectable)()
], MockPoiProvider);
//# sourceMappingURL=mock-poi.provider.js.map