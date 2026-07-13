import { Injectable } from '@nestjs/common';
import { TripContextWebSocketService } from './trip-context-ws.service';
import type { IntercomMessageEvent, TripContextChangedSection } from './trip-context-ws.types';

@Injectable()
export class TripContextChangeNotifierService {
  constructor(private readonly ws: TripContextWebSocketService) {}

  notifyTripContextChanged(input: {
    tripId: string;
    contextVersion: number;
    changedSections: TripContextChangedSection[];
    planVersion?: number;
  }) {
    this.ws.broadcastTripContextChanged(input);
  }

  notifyIntercomMessage(input: Omit<IntercomMessageEvent, 'type' | 'serverTime'>) {
    this.ws.broadcastIntercomMessage(input);
  }
}
