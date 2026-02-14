import { PrismaService } from '../../../prisma/prisma.service';
export interface AddFromCapabilityPackRule {
    id: string;
    level: 'blocker' | 'must' | 'should' | 'optional';
    message: string;
    category?: string;
    tasks?: Array<{
        title: string;
        dueOffsetDays?: number;
        tags?: string[];
    }>;
}
export interface AddFromCapabilityPackRequest {
    packType: string;
    rules: AddFromCapabilityPackRule[];
}
export interface CapabilityPackChecklistItem {
    id: string;
    ruleId: string;
    message: string;
    level: string;
    category?: string;
    tasks?: any;
    sourcePackType: string;
    checked: boolean;
    createdAt: string;
}
export interface AddFromCapabilityPackResponse {
    success: boolean;
    addedCount: number;
    skippedCount: number;
    items: CapabilityPackChecklistItem[];
}
export declare class CapabilityPackChecklistService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    addFromCapabilityPack(tripId: string, request: AddFromCapabilityPackRequest): Promise<AddFromCapabilityPackResponse>;
    getCapabilityPackItems(tripId: string, packType?: string): Promise<CapabilityPackChecklistItem[]>;
    updateItemStatus(tripId: string, itemId: string, checked: boolean): Promise<CapabilityPackChecklistItem>;
    batchUpdateItemStatus(tripId: string, updates: Array<{
        itemId: string;
        checked: boolean;
    }>): Promise<{
        updatedCount: number;
    }>;
    removeItem(tripId: string, itemId: string): Promise<{
        removed: boolean;
    }>;
    removeByPackType(tripId: string, packType: string): Promise<{
        removedCount: number;
    }>;
    getItemsGroupedByLevel(tripId: string): Promise<{
        blocker: CapabilityPackChecklistItem[];
        must: CapabilityPackChecklistItem[];
        should: CapabilityPackChecklistItem[];
        optional: CapabilityPackChecklistItem[];
    }>;
}
