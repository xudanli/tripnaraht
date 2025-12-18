// src/agent/services/actions/places.actions.ts
import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../interfaces/action.interface';
import { PlacesService } from '../../../places/places.service';
import { VectorSearchService } from '../../../places/services/vector-search.service';

/**
 * Places Actions
 */
export function createPlacesActions(
  placesService: PlacesService,
  vectorSearchService?: VectorSearchService
): Action[] {
  return [
    {
      name: 'places.resolve_entities',
      description: '解析用户输入中的实体（POI、地点等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: [],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          lat: { type: 'number', optional: true },
          lng: { type: 'number', optional: true },
          limit: { type: 'number', optional: true },
        },
        required: ['query'],
      },
      output_schema: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          count: { type: 'number' },
        },
      },
      execute: async (input: { query: string; lat?: number; lng?: number; limit?: number }, state: any) => {
        try {
          // 优先使用向量搜索（如果可用）
          let results: any[];
          
          if (vectorSearchService) {
            try {
              // 使用混合搜索（向量 + 关键词）
              const hybridResults = await vectorSearchService.hybridSearch(
                input.query,
                input.lat,
                input.lng,
                undefined, // radius
                undefined, // category
                input.limit || 10
              );
              results = hybridResults;
            } catch (vectorError: any) {
              // 向量搜索失败，降级到关键词搜索
              console.warn(`向量搜索失败，降级到关键词搜索: ${vectorError?.message || String(vectorError)}`);
              results = await placesService.search(
                input.query,
                input.lat,
                input.lng,
                undefined, // radius
                undefined, // category
                input.limit || 10
              );
            }
          } else {
            // 降级到关键词搜索
            results = await placesService.search(
              input.query,
              input.lat,
              input.lng,
              undefined, // radius
              undefined, // category
              input.limit || 10
            );
          }

          // 转换为节点格式
          const nodes = results.map((place: any, index: number) => ({
            id: place.id,
            name: place.nameCN || place.nameEN,
            type: 'poi',
            geo: {
              lat: place.lat || (place as any).location?.lat,
              lng: place.lng || (place as any).location?.lng,
            },
            category: place.category,
            metadata: {
              address: place.address,
              rating: place.rating,
              score: (place as any).score || (place as any).vectorScore,
            },
          }));

          return {
            nodes,
            count: nodes.length,
          };
        } catch (error: any) {
          // 如果所有搜索方法都失败，返回空结果而不是抛出错误
          // 这样可以让系统继续执行其他步骤
          console.error(`实体解析失败，返回空结果: ${error?.message || String(error)}`);
          return {
            nodes: [],
            count: 0,
            error: error?.message || String(error),
          };
        }
      },
    },
    {
      name: 'places.get_poi_facts',
      description: '获取 POI 事实信息（营业时间、规则等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.CALLS_API,
        preconditions: ['draft.nodes'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          poi_ids: { type: 'array', items: { type: 'number' } },
        },
        required: ['poi_ids'],
      },
      output_schema: {
        type: 'object',
        properties: {
          facts: { type: 'object' },
        },
      },
      execute: async (input: { poi_ids: number[] }, state: any) => {
        try {
          // 批量获取 POI 信息
          const places = await placesService.findBatch(input.poi_ids);
          
          // 提取事实信息
          const facts: Record<number, any> = {};
          for (const place of places) {
            const metadata = place.metadata as any;
            facts[place.id] = {
              name: place.nameCN || place.nameEN,
              category: place.category,
              address: place.address,
              rating: place.rating,
              opening_hours: metadata?.openingHours || metadata?.opening_hours,
              price_level: metadata?.priceLevel || metadata?.price_level,
              phone: metadata?.phone,
              website: metadata?.website,
              description: metadata?.description,
            };
          }

          return {
            facts,
          };
        } catch (error: any) {
          throw new Error(`获取 POI 事实失败: ${error?.message || String(error)}`);
        }
      },
    },
  ];
}

