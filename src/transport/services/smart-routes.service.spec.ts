import { SmartRoutesService } from './smart-routes.service';
import { GoogleRoutesService } from './google-routes.service';
import { AmapRoutesService } from './amap-routes.service';
import { MapboxDirectionsService } from './mapbox-directions.service';
import { LocationDetectorService } from './location-detector.service';
import { TransportMode } from '../interfaces/transport.interface';

describe('SmartRoutesService', () => {
  const googleRoutes = {
    getRoutes: jest.fn(),
  } as unknown as jest.Mocked<GoogleRoutesService>;

  const amapRoutes = {
    getRoutes: jest.fn(),
  } as unknown as jest.Mocked<AmapRoutesService>;

  const mapboxDirections = {
    isConfigured: jest.fn(),
    getRoutes: jest.fn(),
  } as unknown as jest.Mocked<MapboxDirectionsService>;

  const locationDetector = {
    areBothInChina: jest.fn(),
    areBothOverseas: jest.fn(),
  } as unknown as jest.Mocked<LocationDetectorService>;

  let service: SmartRoutesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SmartRoutesService(
      googleRoutes,
      amapRoutes,
      locationDetector,
      mapboxDirections,
    );
  });

  it('falls back to Mapbox when Google returns empty for overseas routes', async () => {
    locationDetector.areBothInChina.mockReturnValue(false);
    locationDetector.areBothOverseas.mockReturnValue(true);
    googleRoutes.getRoutes.mockResolvedValue([]);
    mapboxDirections.isConfigured.mockReturnValue(true);
    mapboxDirections.getRoutes.mockResolvedValue([
      {
        mode: TransportMode.TAXI,
        durationMinutes: 95,
        cost: 12,
        walkDistance: 0,
      },
    ]);

    const result = await service.getRoutes(64.13, -21.82, 63.42, -19.01, 'DRIVING');

    expect(googleRoutes.getRoutes).toHaveBeenCalled();
    expect(mapboxDirections.getRoutes).toHaveBeenCalledWith(
      64.13,
      -21.82,
      63.42,
      -19.01,
      'DRIVING',
    );
    expect(result).toHaveLength(1);
    expect(result[0].durationMinutes).toBe(95);
    expect(result[0].routeProvider).toBe('MAPBOX');
  });

  it('returns Google result without calling Mapbox when Google succeeds', async () => {
    locationDetector.areBothInChina.mockReturnValue(false);
    locationDetector.areBothOverseas.mockReturnValue(true);
    googleRoutes.getRoutes.mockResolvedValue([
      {
        mode: TransportMode.TAXI,
        durationMinutes: 88,
        cost: 10,
        walkDistance: 0,
      },
    ]);

    const result = await service.getRoutes(64.13, -21.82, 63.42, -19.01, 'DRIVING');

    expect(mapboxDirections.getRoutes).not.toHaveBeenCalled();
    expect(result[0].durationMinutes).toBe(88);
    expect(result[0].routeProvider).toBe('GOOGLE');
    expect(result[0].fallbackUsed).toBe(false);
  });

  it('force-stamps MAPBOX even if option already had a stale provider field', async () => {
    locationDetector.areBothInChina.mockReturnValue(false);
    locationDetector.areBothOverseas.mockReturnValue(true);
    googleRoutes.getRoutes.mockResolvedValue([]);
    mapboxDirections.isConfigured.mockReturnValue(true);
    mapboxDirections.getRoutes.mockResolvedValue([
      {
        mode: TransportMode.TAXI,
        durationMinutes: 95,
        cost: 12,
        walkDistance: 0,
        // stale / wrong — SmartRoutes must overwrite
        routeProvider: undefined as any,
      },
    ]);

    const result = await service.getRoutes(64.13, -21.82, 63.42, -19.01, 'DRIVING');
    expect(result[0].routeProvider).toBe('MAPBOX');
    expect(result[0].fallbackUsed).toBe(true);
    expect(result[0].fallbackReason).toBe('GOOGLE_EMPTY_FALLBACK_MAPBOX');
  });
});
