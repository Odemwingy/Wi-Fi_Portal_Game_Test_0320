import { Inject, Injectable } from "@nestjs/common";

import type { RoomSnapshot } from "@wifi-portal/game-sdk";

import { JsonStateStore } from "./json-state-store";

const ROOM_KEY_PREFIX = "wifi-portal:room:";
const ROOM_TTL_SECONDS = 60 * 60 * 2;

export abstract class RoomRepository {
  abstract delete(roomId: string): Promise<void>;
  abstract get(roomId: string): Promise<RoomSnapshot | undefined>;
  abstract listIds(): Promise<string[]>;
  abstract set(room: RoomSnapshot): Promise<RoomSnapshot>;
}

@Injectable()
export class StateStoreRoomRepository extends RoomRepository {
  constructor(@Inject(JsonStateStore) private readonly stateStore: JsonStateStore) {
    super();
  }

  async delete(roomId: string) {
    await this.stateStore.delete(this.toStorageKey(roomId));
  }

  async get(roomId: string) {
    return this.stateStore.get<RoomSnapshot>(this.toStorageKey(roomId));
  }

  async listIds() {
    return (await this.stateStore.list(ROOM_KEY_PREFIX)).map((key) =>
      key.slice(ROOM_KEY_PREFIX.length)
    );
  }

  async set(room: RoomSnapshot) {
    return this.stateStore.set(this.toStorageKey(room.room_id), room, {
      ttl_seconds: ROOM_TTL_SECONDS
    });
  }

  private toStorageKey(roomId: string) {
    return `${ROOM_KEY_PREFIX}${roomId}`;
  }
}
