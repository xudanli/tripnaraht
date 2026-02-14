import { PlaceCategory } from '@prisma/client';
export declare class AvailablePoisQueryDto {
    category?: PlaceCategory;
    search?: string;
    page?: number;
    limit?: number;
}
