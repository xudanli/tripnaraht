import {
  formatDateRangeLabel,
  formatDurationLabel,
  formatRegionSummary,
  formatTransferLabel,
} from '../dictionaries/iceland-self-drive.dictionaries';
import { buildGeneratedRoute } from '../services/iceland-self-drive-response.util';
import type { IcelandSelfDriveWizardInput } from '../types/iceland-self-drive.types';

const wizard: IcelandSelfDriveWizardInput = {
  destinationCode: 'IS',
  productLine: 'iceland_self_drive',
  dateRange: { startDate: '2027-02-10', endDate: '2027-02-18' },
  arrivalAt: null,
  departureAt: null,
  travelerCount: 4,
  startLocationCode: 'keflavik',
  endLocationCode: 'keflavik',
  endSameAsStart: true,
  vehicleAcquisition: 'rent',
  regionIds: ['south_coast', 'snaefellsnes', 'ring_road'],
  bookings: [],
  skipBookings: false,
  fillBookingsLater: false,
};

describe('iceland-self-drive dictionaries + generatedRoute', () => {
  it('formats labels for result page', () => {
    expect(formatRegionSummary(wizard.regionIds)).toBe('南岸 + 斯奈山 + 环岛');
    expect(formatDurationLabel('2027-02-10', '2027-02-18')).toBe('9天8晚');
    expect(formatDateRangeLabel('2027-02-10', '2027-02-18')).toBe(
      '2月10日 - 2月18日',
    );
    expect(formatTransferLabel('keflavik', 'keflavik', true)).toBe(
      '凯夫拉维克往返',
    );
  });

  it('buildGeneratedRoute matches product copy', () => {
    const route = buildGeneratedRoute(wizard);
    expect(route.summaryTitle).toBe('初始路线已生成');
    expect(route.travelerLabel).toBe('4人同行');
    expect(route.regionSummary).toContain('南岸');
  });
});
