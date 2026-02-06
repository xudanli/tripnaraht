import { Controller, Post, Body, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { GoogleMapsDirectService } from './google-maps-direct.service';

@Controller('api/google-maps-direct')
export class GoogleMapsDirectController {
  constructor(private readonly googleMapsService: GoogleMapsDirectService) {}

  @Public()
  @Get('health')
  async health() {
    return {
      success: true,
      available: this.googleMapsService.isServiceAvailable(),
    };
  }

  @Public()
  @Post('route')
  async getRoute(@Body() body: {
    origin: string;
    destination: string;
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
    waypoints?: string[];
    avoid?: ('tolls' | 'highways' | 'ferries')[];
    alternatives?: boolean;
    language?: string;
    units?: 'metric' | 'imperial';
  }) {
    try {
      const result = await this.googleMapsService.getRoute(body);
      return result;
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'GOOGLE_MAPS_ERROR',
            message: error.message || 'Failed to get route',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('distance-matrix')
  async computeDistanceMatrix(@Body() body: {
    origins: string[];
    destinations: string[];
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
    language?: string;
    units?: 'metric' | 'imperial';
    avoid?: ('tolls' | 'highways' | 'ferries')[];
  }) {
    try {
      const result = await this.googleMapsService.computeDistanceMatrix(body);
      return result;
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'GOOGLE_MAPS_ERROR',
            message: error.message || 'Failed to compute distance matrix',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('geocode')
  async geocode(@Body() body: {
    address?: string;
    latlng?: { lat: number; lng: number };
    language?: string;
    region?: string;
  }) {
    try {
      const result = await this.googleMapsService.geocode(body);
      return result;
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'GOOGLE_MAPS_ERROR',
            message: error.message || 'Failed to geocode',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('search-places')
  async searchPlaces(@Body() body: {
    query: string;
    location?: { lat: number; lng: number };
    radius?: number;
    language?: string;
    type?: string;
  }) {
    try {
      const result = await this.googleMapsService.searchPlaces(body);
      return result;
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'GOOGLE_MAPS_ERROR',
            message: error.message || 'Failed to search places',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Post('nearby-search')
  async nearbySearch(@Body() body: {
    location: { lat: number; lng: number };
    radius?: number;
    type?: string;
    keyword?: string;
    language?: string;
  }) {
    try {
      const result = await this.googleMapsService.nearbySearch(body);
      return result;
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'GOOGLE_MAPS_ERROR',
            message: error.message || 'Failed to search nearby',
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
