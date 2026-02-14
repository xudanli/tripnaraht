"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var System1ExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.System1ExecutorService = void 0;
const common_1 = require("@nestjs/common");
const router_interface_1 = require("../interfaces/router.interface");
const places_service_1 = require("../../places/places.service");
const trips_service_1 = require("../../trips/trips.service");
const itinerary_items_service_1 = require("../../itinerary-items/itinerary-items.service");
const create_itinerary_item_dto_1 = require("../../itinerary-items/dto/create-itinerary-item.dto");
const luxon_1 = require("luxon");
const enhanced_chat_service_1 = require("../../rag/services/enhanced-chat.service");
const system1_info_card_service_1 = require("./system1-info-card.service");
let System1ExecutorService = System1ExecutorService_1 = class System1ExecutorService {
    constructor(placesService, tripsService, itineraryItemsService, enhancedChat, infoCardService) {
        this.placesService = placesService;
        this.tripsService = tripsService;
        this.itineraryItemsService = itineraryItemsService;
        this.enhancedChat = enhancedChat;
        this.infoCardService = infoCardService;
        this.logger = new common_1.Logger(System1ExecutorService_1.name);
    }
    async execute(route, state) {
        const startTime = Date.now();
        try {
            if (this.shouldGenerateInfoCard(state)) {
                return await this.generateInfoCard(state);
            }
            if (route === router_interface_1.RouteType.SYSTEM1_API) {
                const apiResult = await this.executeAPI(state);
                return {
                    success: apiResult.success,
                    result: apiResult.result,
                    answerText: apiResult.answerText,
                    cardType: 'API_RESULT',
                };
            }
            else if (route === router_interface_1.RouteType.SYSTEM1_RAG) {
                const ragResult = await this.executeRAG(state);
                return {
                    success: ragResult.success,
                    result: ragResult.result,
                    answerText: ragResult.answerText,
                    cardType: 'RAG_RESULT',
                };
            }
            else {
                throw new Error(`Unsupported System1 route: ${route}`);
            }
        }
        catch (error) {
            this.logger.error(`System1 execution error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                success: false,
                result: null,
                answerText: `处理请求时出错：${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`,
                cardType: undefined,
            };
        }
        finally {
            const latency = Date.now() - startTime;
            this.logger.debug(`System1 execution completed in ${latency}ms`);
        }
    }
    shouldGenerateInfoCard(state) {
        if (!this.infoCardService) {
            return false;
        }
        const input = state.user_input.toLowerCase();
        const routeKeywords = ['路线', 'route', '路线信息', '路线详情', '路线卡片'];
        return routeKeywords.some(keyword => input.includes(keyword));
    }
    async generateInfoCard(state) {
        if (!this.infoCardService) {
            return {
                success: false,
                result: null,
                answerText: '信息卡片服务不可用',
                cardType: undefined,
            };
        }
        try {
            const routeId = this.extractRouteId(state.user_input);
            if (!routeId) {
                return {
                    success: false,
                    result: null,
                    answerText: '未找到路线ID，请提供路线名称或ID',
                    cardType: undefined,
                };
            }
            const infoCard = await this.infoCardService.generateInfoCard(routeId, state);
            return {
                success: true,
                result: infoCard,
                answerText: null,
                cardType: 'INFO_CARD',
            };
        }
        catch (error) {
            this.logger.error(`Failed to generate info card: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                success: false,
                result: null,
                answerText: `生成信息卡片失败：${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`,
                cardType: undefined,
            };
        }
    }
    extractRouteId(input) {
        const idMatch = input.match(/route[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
        if (idMatch) {
            return idMatch[1];
        }
        const uuidMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
            return uuidMatch[0];
        }
        return null;
    }
    async executeAPI(state) {
        const input = state.user_input.toLowerCase();
        if (/删除|移除/.test(input)) {
            const match = input.match(/删除|移除\s*(.+)/);
            if (match && match[1]) {
                const targetName = match[1].trim();
                try {
                    const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
                    if (searchResults.length === 0) {
                        return {
                            success: false,
                            result: { action: 'delete', target: targetName, resolved: false },
                            answerText: `未找到"${targetName}"，请检查名称是否正确`,
                        };
                    }
                    if (searchResults.length === 1) {
                        const poi = searchResults[0];
                        if (!state.trip.trip_id) {
                            return {
                                success: false,
                                result: { action: 'delete', target: targetName, resolved: false },
                                answerText: '未找到行程信息，无法执行删除操作',
                            };
                        }
                        try {
                            const trip = await this.tripsService.findOne(state.trip.trip_id);
                            const itemsToDelete = [];
                            for (const day of trip.days || []) {
                                for (const item of day.items || []) {
                                    if (item.placeId === poi.id) {
                                        itemsToDelete.push(item.id);
                                    }
                                }
                            }
                            if (itemsToDelete.length === 0) {
                                return {
                                    success: false,
                                    result: { action: 'delete', target: targetName, resolved: false },
                                    answerText: `未找到行程中包含"${poi.nameCN || poi.nameEN}"的项目`,
                                };
                            }
                            for (const itemId of itemsToDelete) {
                                await this.itineraryItemsService.remove(itemId);
                            }
                            return {
                                success: true,
                                result: {
                                    action: 'delete',
                                    target: targetName,
                                    resolved: true,
                                    poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                                    deletedCount: itemsToDelete.length
                                },
                                answerText: `已删除 ${itemsToDelete.length} 个包含"${poi.nameCN || poi.nameEN}"的行程项`,
                            };
                        }
                        catch (error) {
                            this.logger.error(`删除操作失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                            return {
                                success: false,
                                result: { action: 'delete', target: targetName, resolved: false },
                                answerText: `删除操作失败：${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`,
                            };
                        }
                    }
                    return {
                        success: false,
                        result: {
                            action: 'delete',
                            target: targetName,
                            resolved: false,
                            candidates: searchResults.slice(0, 5).map(p => ({
                                id: p.id,
                                name: p.nameCN || p.nameEN,
                            }))
                        },
                        answerText: `找到多个匹配的"${targetName}"，请选择要删除的具体地点`,
                    };
                }
                catch (error) {
                    this.logger.error(`实体解析失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                    return {
                        success: false,
                        result: { action: 'delete', target: targetName, resolved: false },
                        answerText: `解析"${targetName}"时出错，请重试`,
                    };
                }
            }
        }
        if (/添加|加入/.test(input)) {
            const match = input.match(/添加|加入\s*(.+)/);
            if (match && match[1]) {
                const targetName = match[1].trim();
                try {
                    const searchResults = await this.placesService.search(targetName, undefined, undefined, undefined, undefined, 5);
                    if (searchResults.length === 0) {
                        return {
                            success: false,
                            result: { action: 'add', target: targetName, resolved: false },
                            answerText: `未找到"${targetName}"，请检查名称是否正确或提供更多信息`,
                        };
                    }
                    if (searchResults.length === 1) {
                        const poi = searchResults[0];
                        if (!state.trip.trip_id) {
                            return {
                                success: false,
                                result: { action: 'add', target: targetName, resolved: false },
                                answerText: '未找到行程信息，无法执行添加操作',
                            };
                        }
                        try {
                            const trip = await this.tripsService.findOne(state.trip.trip_id);
                            if (!trip.days || trip.days.length === 0) {
                                return {
                                    success: false,
                                    result: { action: 'add', target: targetName, resolved: false },
                                    answerText: '行程中没有可用的日期',
                                };
                            }
                            const firstDay = trip.days[0];
                            const existingItems = firstDay.items || [];
                            const dayDate = luxon_1.DateTime.fromJSDate(firstDay.date);
                            let startTime;
                            let endTime;
                            if (existingItems.length > 0 && existingItems[existingItems.length - 1].endTime) {
                                const lastEndTime = luxon_1.DateTime.fromJSDate(existingItems[existingItems.length - 1].endTime);
                                startTime = lastEndTime.toJSDate();
                                endTime = lastEndTime.plus({ hours: 2 }).toJSDate();
                            }
                            else {
                                startTime = dayDate.set({ hour: 10, minute: 0, second: 0 }).toJSDate();
                                endTime = dayDate.set({ hour: 12, minute: 0, second: 0 }).toJSDate();
                            }
                            const newItem = await this.itineraryItemsService.create({
                                tripDayId: firstDay.id,
                                placeId: poi.id,
                                type: create_itinerary_item_dto_1.ItemType.ACTIVITY,
                                startTime: startTime.toISOString(),
                                endTime: endTime.toISOString(),
                            });
                            return {
                                success: true,
                                result: {
                                    action: 'add',
                                    target: targetName,
                                    resolved: true,
                                    poi: { id: poi.id, name: poi.nameCN || poi.nameEN },
                                    item: { id: newItem.id, startTime, endTime }
                                },
                                answerText: `已添加：${poi.nameCN || poi.nameEN || targetName}`,
                            };
                        }
                        catch (error) {
                            this.logger.error(`添加操作失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                            return {
                                success: false,
                                result: { action: 'add', target: targetName, resolved: false },
                                answerText: `添加操作失败：${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`,
                            };
                        }
                    }
                    return {
                        success: false,
                        result: {
                            action: 'add',
                            target: targetName,
                            resolved: false,
                            candidates: searchResults.slice(0, 5).map(p => ({
                                id: p.id,
                                name: p.nameCN || p.nameEN,
                            }))
                        },
                        answerText: `找到多个匹配的"${targetName}"，请选择要添加的具体地点`,
                    };
                }
                catch (error) {
                    this.logger.error(`实体解析失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                    return {
                        success: false,
                        result: { action: 'add', target: targetName, resolved: false },
                        answerText: `解析"${targetName}"时出错，请重试`,
                    };
                }
            }
        }
        const hasTripId = !!state.trip.trip_id;
        let guidanceMessage = '';
        if (hasTripId) {
            guidanceMessage = `我可以帮您：\n\n` +
                `• **添加地点**：例如"添加东京塔"或"在行程中加入浅草寺"\n` +
                `• **删除地点**：例如"删除浅草寺"或"移除东京塔"\n` +
                `• **查询地点**：例如"推荐新宿的拉面店"或"附近有什么景点"\n` +
                `• **规划行程**：例如"规划5天东京游"或"帮我规划行程"\n\n` +
                `请告诉我您想要做什么？`;
        }
        else {
            guidanceMessage = `我可以帮您：\n\n` +
                `• **规划行程**：例如"规划5天东京游"或"帮我规划冰岛7日行程"\n` +
                `• **查询地点**：例如"推荐新宿的拉面店"或"东京有什么好玩的"\n` +
                `• **搜索景点**：例如"搜索东京塔"或"查找浅草寺"\n` +
                `• **创建行程**：告诉我目的地、日期和偏好，我来为您规划\n\n` +
                `请告诉我您想要做什么？`;
        }
        return {
            success: false,
            result: null,
            answerText: guidanceMessage,
        };
    }
    async executeRAG(state) {
        const input = state.user_input;
        try {
            if (this.enhancedChat && this.isRouteQuestion(input)) {
                const context = this.extractRouteContext(state);
                const enhancedAnswer = await this.enhancedChat.answerRouteQuestion(input, context);
                return {
                    success: true,
                    result: {
                        type: 'rag',
                        query: input,
                        source: enhancedAnswer.source,
                        structuredData: enhancedAnswer.structuredData,
                        ragSnippets: enhancedAnswer.ragSnippets,
                        localInsights: enhancedAnswer.localInsights,
                    },
                    answerText: enhancedAnswer.answer,
                };
            }
            const results = await this.placesService.search(input, undefined, undefined, undefined, undefined, 10);
            if (results.length === 0) {
                return {
                    success: true,
                    result: {
                        type: 'rag',
                        query: input,
                        results: [],
                    },
                    answerText: `未找到与"${input}"相关的地点信息。`,
                };
            }
            const formattedResults = results.map((place, index) => ({
                rank: index + 1,
                id: place.id,
                name: place.nameCN || place.nameEN,
                category: place.category,
                address: place.address,
                rating: place.rating,
            }));
            const topResult = results[0];
            const answerText = results.length === 1
                ? `找到了"${topResult.nameCN || topResult.nameEN}"。${topResult.address ? `地址：${topResult.address}` : ''}`
                : `找到了 ${results.length} 个相关地点，推荐：${topResult.nameCN || topResult.nameEN}${results.length > 1 ? ` 等` : ''}`;
            return {
                success: true,
                result: {
                    type: 'rag',
                    query: input,
                    results: formattedResults,
                    top_result: formattedResults[0],
                },
                answerText,
            };
        }
        catch (error) {
            this.logger.error(`RAG execution error: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
            return {
                success: false,
                result: null,
                answerText: '查询知识库时出错',
            };
        }
    }
    isRouteQuestion(input) {
        const lowerInput = input.toLowerCase();
        const routeKeywords = [
            '路线', 'route', '路线方向', 'route direction',
            '为什么选', '为什么推荐', 'why', 'why this',
            '什么感觉', '怎么样', '体验', 'experience',
            '建议', 'tips', '需要注意', '注意',
            'f-road', 'f路', 'highlands', '高地',
            'ebc', '徒步', 'hiking', 'trekking',
        ];
        return routeKeywords.some(keyword => lowerInput.includes(keyword));
    }
    extractRouteContext(state) {
        return {
            tripId: state.trip_id || undefined,
        };
    }
};
exports.System1ExecutorService = System1ExecutorService;
exports.System1ExecutorService = System1ExecutorService = System1ExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [places_service_1.PlacesService,
        trips_service_1.TripsService,
        itinerary_items_service_1.ItineraryItemsService,
        enhanced_chat_service_1.EnhancedChatService,
        system1_info_card_service_1.System1InfoCardService])
], System1ExecutorService);
//# sourceMappingURL=system1-executor.service.js.map