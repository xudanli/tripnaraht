import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import type {
  IntercomMessageEvent,
  TripContextChangedEvent,
  TripContextWsClientMessage,
  TripContextWsServerMessage,
} from './trip-context-ws.types';

interface WsClientState {
  userId: string;
  subscriptions: Set<string>;
}

function isTripContextWsEnabled(): boolean {
  const flag = process.env.MOBILE_TRIP_CONTEXT_WS_ENABLED;
  if (flag === 'false' || flag === '0') return false;
  return true;
}

@Injectable()
export class TripContextWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripContextWebSocketService.name);
  private wss?: WebSocketServer;
  private readonly clients = new Map<WebSocket, WsClientState>();
  private readonly tripSubscribers = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly jwtService: JwtService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  onModuleInit() {
    if (!isTripContextWsEnabled()) {
      this.logger.log('Mobile trip context WebSocket disabled (MOBILE_TRIP_CONTEXT_WS_ENABLED=false)');
      return;
    }

    const server = this.httpAdapterHost.httpAdapter.getHttpServer() as Server;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = request.url ?? '';
      if (!url.startsWith('/ws')) {
        return;
      }
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.wss!.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws, request) => this.handleConnection(ws, request));
    this.logger.log('Mobile trip context WebSocket listening on /ws');
  }

  onModuleDestroy() {
    for (const ws of this.clients.keys()) {
      ws.close();
    }
    this.clients.clear();
    this.tripSubscribers.clear();
    this.wss?.close();
  }

  broadcastTripContextChanged(event: Omit<TripContextChangedEvent, 'type' | 'serverTime'>) {
    if (!this.wss) return;
    const payload: TripContextChangedEvent = {
      type: 'trip_context_changed',
      serverTime: new Date().toISOString(),
      ...event,
    };
    const subs = this.tripSubscribers.get(event.tripId);
    if (!subs?.size) return;

    const raw = JSON.stringify(payload);
    for (const ws of subs) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  broadcastIntercomMessage(
    event: Omit<IntercomMessageEvent, 'type' | 'serverTime'>,
  ) {
    if (!this.wss) return;
    const subs = this.tripSubscribers.get(event.tripId);
    if (!subs?.size) return;

    const serverTime = new Date().toISOString();
    for (const ws of subs) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const state = this.clients.get(ws);
      const payload: IntercomMessageEvent = {
        type: 'intercom_message',
        serverTime,
        tripId: event.tripId,
        contextVersion: event.contextVersion,
        message: {
          ...event.message,
          isOwn: state?.userId === event.message.senderId,
        },
      };
      ws.send(JSON.stringify(payload));
    }
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    const urlToken = extractTokenFromUrl(request.url);
    void this.resolveUserId(urlToken)
      .then((userId) => {
        this.clients.set(ws, { userId, subscriptions: new Set() });
        ws.on('message', (raw) => void this.handleMessage(ws, raw));
        ws.on('close', () => this.cleanupClient(ws));
        ws.on('error', () => this.cleanupClient(ws));
      })
      .catch((err) => {
        this.send(ws, {
          type: 'error',
          code: 'UNAUTHORIZED',
          message: err instanceof Error ? err.message : 'Unauthorized',
        });
        ws.close();
      });
  }

  private async handleMessage(ws: WebSocket, raw: RawData) {
    let msg: TripContextWsClientMessage;
    try {
      msg = JSON.parse(String(raw)) as TripContextWsClientMessage;
    } catch {
      this.send(ws, { type: 'error', code: 'INVALID_JSON', message: '消息须为 JSON' });
      return;
    }

    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong', serverTime: new Date().toISOString() });
      return;
    }

    const state = this.clients.get(ws);
    if (!state) {
      this.send(ws, { type: 'error', code: 'UNAUTHORIZED', message: '未认证' });
      return;
    }

    if (msg.type === 'subscribe') {
      try {
        if (msg.token) {
          state.userId = await this.resolveUserId(msg.token);
        }
        await this.access.assertTripMember(msg.tripId, state.userId);
        this.subscribe(ws, state, msg.tripId);
        this.send(ws, {
          type: 'subscribed',
          tripId: msg.tripId,
          serverTime: new Date().toISOString(),
        });
      } catch (err) {
        this.send(ws, this.mapError(err));
      }
      return;
    }

    if (msg.type === 'unsubscribe') {
      this.unsubscribe(ws, state, msg.tripId);
      this.send(ws, {
        type: 'unsubscribed',
        tripId: msg.tripId,
        serverTime: new Date().toISOString(),
      });
    }
  }

  private subscribe(ws: WebSocket, state: WsClientState, tripId: string) {
    state.subscriptions.add(tripId);
    const set = this.tripSubscribers.get(tripId) ?? new Set<WebSocket>();
    set.add(ws);
    this.tripSubscribers.set(tripId, set);
  }

  private unsubscribe(ws: WebSocket, state: WsClientState, tripId: string) {
    state.subscriptions.delete(tripId);
    const set = this.tripSubscribers.get(tripId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.tripSubscribers.delete(tripId);
    }
  }

  private cleanupClient(ws: WebSocket) {
    const state = this.clients.get(ws);
    if (state) {
      for (const tripId of state.subscriptions) {
        this.unsubscribe(ws, state, tripId);
      }
    }
    this.clients.delete(ws);
  }

  private send(ws: WebSocket, message: TripContextWsServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private mapError(err: unknown): TripContextWsServerMessage {
    if (err instanceof UnauthorizedException) {
      return { type: 'error', code: 'UNAUTHORIZED', message: err.message };
    }
    if (err instanceof ForbiddenException) {
      return { type: 'error', code: 'FORBIDDEN', message: err.message };
    }
    if (err instanceof NotFoundException) {
      return { type: 'error', code: 'NOT_FOUND', message: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', code: 'INTERNAL_ERROR', message };
  }

  private async resolveUserId(token?: string): Promise<string> {
    if (token?.trim()) {
      const payload = await this.jwtService.verifyAsync<{ sub?: string }>(token.trim());
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token');
      }
      return payload.sub;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('需要 token（query ?token= 或 subscribe.token）');
  }
}

function extractTokenFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const query = url.includes('?') ? url.split('?')[1] : '';
  const params = new URLSearchParams(query);
  return params.get('token') ?? undefined;
}
