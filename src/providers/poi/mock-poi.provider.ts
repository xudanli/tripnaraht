// src/providers/poi/mock-poi.provider.ts

import { Injectable } from '@nestjs/common';
import { PoiProvider } from './poi.provider.interface';
import { PoiCandidate } from '../../assist/dto/action.dto';

/**
 * Mock POI 提供者（用于开发和测试）
 * 
 * 根据查询文本返回模拟的 POI 数据
 */
@Injectable()
export class MockPoiProvider implements PoiProvider {
  async textSearch(args: {
    query: string;
    lat: number;
    lng: number;
    radiusM?: number;
    language?: string;
    types?: string[];
  }): Promise<PoiCandidate[]> {
    const { query, lat, lng } = args;
    
    // 简单的关键词匹配，返回模拟数据
    const queryLower = query.toLowerCase();
    
    // 模拟数据库
    const mockPois: PoiCandidate[] = [
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

    // 简单的文本匹配
    const matched = mockPois.filter((poi) => {
      const searchText = `${poi.name} ${poi.nameEN || ''} ${poi.nameCN || ''}`.toLowerCase();
      return searchText.includes(queryLower) || queryLower.includes(poi.name.toLowerCase());
    });

    // 如果没匹配到，返回前 3 个（模拟搜索结果）
    if (matched.length === 0) {
      return mockPois.slice(0, 3).map((poi) => ({
        ...poi,
        distanceM: Math.floor(Math.random() * 2000) + 200,
        matchScore: 0.5,
      }));
    }

    // 计算简单的匹配分数
    return matched.map((poi) => {
      const searchText = `${poi.name} ${poi.nameEN || ''}`.toLowerCase();
      let matchScore = 0.5;
      if (searchText.startsWith(queryLower)) {
        matchScore = 0.9;
      } else if (searchText.includes(queryLower)) {
        matchScore = 0.7;
      }

      return {
        ...poi,
        matchScore,
      };
    });
  }

  async nearbySearch(args: {
    lat: number;
    lng: number;
    radiusM?: number;
    type?: string;
    keyword?: string;
    language?: string;
  }): Promise<PoiCandidate[]> {
    // 复用 textSearch 逻辑
    return this.textSearch({
      query: args.keyword || args.type || '',
      lat: args.lat,
      lng: args.lng,
      radiusM: args.radiusM,
      language: args.language,
      types: args.type ? [args.type] : undefined,
    });
  }
}
