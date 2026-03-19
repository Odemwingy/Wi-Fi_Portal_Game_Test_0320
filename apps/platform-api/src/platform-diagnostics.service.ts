import { Inject, Injectable } from "@nestjs/common";

import { JsonStateStore } from "./repositories/json-state-store";
import { RoomRepository } from "./repositories/room.repository";
import { loadStateStoreConfig } from "./repositories/state-store.config";
import { PlatformMetricsService } from "./platform-metrics.service";

@Injectable()
export class PlatformDiagnosticsService {
  constructor(
    @Inject(JsonStateStore) private readonly stateStore: JsonStateStore,
    @Inject(RoomRepository) private readonly roomRepository: RoomRepository,
    @Inject(PlatformMetricsService)
    private readonly platformMetricsService: PlatformMetricsService
  ) {}

  async getLiveness() {
    const stateStoreConfig = loadStateStoreConfig();

    return {
      release_version: process.env.RELEASE_VERSION ?? "dev",
      service: "platform-api",
      started_at: new Date(
        process.uptime() ? Date.now() - process.uptime() * 1000 : Date.now()
      ).toISOString(),
      state_store_backend: stateStoreConfig.backend,
      status: "ok"
    };
  }

  async getReadiness() {
    const roomStats = await this.collectRoomStats();
    const dependency = await this.stateStore.getHealth();

    return {
      checked_at: new Date().toISOString(),
      dependencies: {
        state_store: dependency
      },
      rooms: roomStats,
      service: "platform-api",
      status: dependency.status === "ok" ? "ready" : "not_ready"
    };
  }

  async getMetrics() {
    const roomStats = await this.collectRoomStats();
    const readiness = await this.stateStore.getHealth();

    return {
      dependencies: {
        state_store: readiness
      },
      ...this.platformMetricsService.getSnapshot(roomStats)
    };
  }

  private async collectRoomStats() {
    const roomIds = await this.roomRepository.listIds();
    let activeRooms = 0;
    let connectedPlayers = 0;
    let disconnectedPlayers = 0;

    for (const roomId of roomIds) {
      const room = await this.roomRepository.get(roomId);
      if (!room) {
        continue;
      }

      activeRooms += 1;
      for (const player of room.players) {
        if (player.connection_status === "connected") {
          connectedPlayers += 1;
        } else {
          disconnectedPlayers += 1;
        }
      }
    }

    return {
      active_rooms: activeRooms,
      connected_players: connectedPlayers,
      disconnected_players: disconnectedPlayers
    };
  }
}
