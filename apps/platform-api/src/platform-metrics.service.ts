import { Injectable } from "@nestjs/common";

type HttpRequestMetric = {
  duration_ms: number;
  method: string;
  path: string;
  recorded_at: number;
  status_code: number;
};

type WsRttMetric = {
  duration_ms: number;
  recorded_at: number;
};

type WsMessageDirection = "received" | "sent";

const ONE_MINUTE_MS = 60_000;

@Injectable()
export class PlatformMetricsService {
  private readonly startedAt = Date.now();
  private readonly httpRequests: HttpRequestMetric[] = [];
  private readonly wsRttSamples: WsRttMetric[] = [];
  private readonly httpPathCounts = new Map<string, number>();
  private readonly httpStatusCounts = new Map<string, number>();
  private readonly wsMessageCounts = new Map<string, number>();
  private totalHttpRequests = 0;
  private totalHttpDurationMs = 0;
  private activeWsConnections = 0;
  private totalWsConnections = 0;
  private totalWsMessagesReceived = 0;
  private totalWsMessagesSent = 0;

  recordHttpRequest(input: {
    duration_ms: number;
    method: string;
    path: string;
    status_code: number;
  }) {
    const now = Date.now();
    this.prune(now);

    this.totalHttpRequests += 1;
    this.totalHttpDurationMs += input.duration_ms;
    this.httpRequests.push({
      ...input,
      recorded_at: now
    });

    const routeKey = `${input.method} ${input.path}`;
    this.httpPathCounts.set(routeKey, (this.httpPathCounts.get(routeKey) ?? 0) + 1);
    const statusBucket = `${Math.floor(input.status_code / 100)}xx`;
    this.httpStatusCounts.set(
      statusBucket,
      (this.httpStatusCounts.get(statusBucket) ?? 0) + 1
    );
  }

  recordWsConnectionOpened() {
    this.activeWsConnections += 1;
    this.totalWsConnections += 1;
  }

  recordWsConnectionClosed() {
    this.activeWsConnections = Math.max(0, this.activeWsConnections - 1);
  }

  recordWsMessage(direction: WsMessageDirection, type: string) {
    if (direction === "received") {
      this.totalWsMessagesReceived += 1;
    } else {
      this.totalWsMessagesSent += 1;
    }

    const key = `${direction}:${type}`;
    this.wsMessageCounts.set(key, (this.wsMessageCounts.get(key) ?? 0) + 1);
  }

  recordWsRtt(durationMs: number) {
    const now = Date.now();
    this.prune(now);
    this.wsRttSamples.push({
      duration_ms: durationMs,
      recorded_at: now
    });
  }

  getSnapshot(roomStats: {
    active_rooms: number;
    connected_players: number;
    disconnected_players: number;
  }) {
    const now = Date.now();
    this.prune(now);

    return {
      generated_at: new Date(now).toISOString(),
      rooms: roomStats,
      uptime_seconds: this.toRoundedNumber((now - this.startedAt) / 1000),
      http: {
        active_window_seconds: 60,
        avg_duration_ms: this.toRoundedNumber(
          this.totalHttpRequests === 0
            ? 0
            : this.totalHttpDurationMs / this.totalHttpRequests
        ),
        path_counts: Object.fromEntries(this.httpPathCounts.entries()),
        qps_1m: this.toRoundedNumber(this.httpRequests.length / 60),
        qps_since_start: this.toRoundedNumber(
          this.totalHttpRequests / Math.max(1, (now - this.startedAt) / 1000)
        ),
        requests_total: this.totalHttpRequests,
        status_counts: Object.fromEntries(this.httpStatusCounts.entries())
      },
      websocket: {
        active_connections: this.activeWsConnections,
        avg_rtt_ms_1m: this.toRoundedNumber(
          this.average(this.wsRttSamples.map((sample) => sample.duration_ms))
        ),
        connections_total: this.totalWsConnections,
        messages_received_total: this.totalWsMessagesReceived,
        messages_sent_total: this.totalWsMessagesSent,
        message_type_counts: Object.fromEntries(this.wsMessageCounts.entries())
      }
    };
  }

  private average(values: number[]) {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private prune(now: number) {
    this.pruneTimedArray(this.httpRequests, now);
    this.pruneTimedArray(this.wsRttSamples, now);
  }

  private pruneTimedArray<T extends { recorded_at: number }>(entries: T[], now: number) {
    while (entries[0] && now - entries[0].recorded_at > ONE_MINUTE_MS) {
      entries.shift();
    }
  }

  private toRoundedNumber(value: number) {
    return Number(value.toFixed(2));
  }
}

export const sharedPlatformMetricsService = new PlatformMetricsService();
