import axios from 'axios';
import { MapboxDirectionsService } from './mapbox-directions.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MapboxDirectionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
    } as any);
  });

  it('returns null when token is missing', async () => {
    const service = new MapboxDirectionsService({
      get: () => undefined,
    } as any);
    const result = await service.computeRouteGeometry(64.13, -21.82, 63.42, -19.01);
    expect(result).toBeNull();
  });

  it('parses directions geometry from Mapbox response', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        routes: [
          {
            geometry: 'encoded-polyline6',
            distance: 189200,
            duration: 7200,
          },
        ],
      },
    });
    mockedAxios.create.mockReturnValue({ get } as any);

    const service = new MapboxDirectionsService({
      get: (key: string) => (key === 'VITE_MAPBOX_ACCESS_TOKEN' ? 'pk.test' : undefined),
    } as any);

    const result = await service.computeRouteGeometry(64.13, -21.82, 63.42, -19.01);
    expect(result).toEqual({
      polyline: 'encoded-polyline6',
      distanceMeters: 189200,
      durationMinutes: 120,
    });
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/directions/v5/mapbox/driving/-21.82,64.13;-19.01,63.42.json'),
      expect.objectContaining({
        params: expect.objectContaining({ geometries: 'polyline', overview: 'full' }),
      }),
    );
  });
});
