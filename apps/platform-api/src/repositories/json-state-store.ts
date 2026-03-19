import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";

import { loadStateStoreConfig, type StateStoreConfig } from "./state-store.config";

export type StateStoreSetOptions = {
  ttl_seconds?: number;
};

export abstract class JsonStateStore {
  abstract delete(key: string): Promise<void>;
  abstract get<T>(key: string): Promise<T | undefined>;
  abstract list(prefix: string): Promise<string[]>;
  abstract set<T>(
    key: string,
    value: T,
    options?: StateStoreSetOptions
  ): Promise<T>;
}

@Injectable()
export class InMemoryJsonStateStore extends JsonStateStore {
  private readonly entries = new Map<
    string,
    {
      expires_at: number | null;
      value: unknown;
    }
  >();

  async delete(key: string) {
    this.entries.delete(key);
  }

  async get<T>(key: string) {
    this.cleanupKey(key);
    return this.entries.get(key)?.value as T | undefined;
  }

  async list(prefix: string) {
    const keys: string[] = [];

    for (const key of this.entries.keys()) {
      this.cleanupKey(key);
      if (this.entries.has(key) && key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  async set<T>(key: string, value: T, options: StateStoreSetOptions = {}) {
    this.entries.set(key, {
      expires_at:
        options.ttl_seconds === undefined
          ? null
          : Date.now() + options.ttl_seconds * 1000,
      value
    });
    return value;
  }

  private cleanupKey(key: string) {
    const entry = this.entries.get(key);
    if (!entry || entry.expires_at === null) {
      return;
    }

    if (entry.expires_at <= Date.now()) {
      this.entries.delete(key);
    }
  }
}

export class RedisJsonStateStore
  extends JsonStateStore
  implements OnModuleDestroy
{
  private client: RedisClientType | null = null;
  private connectPromise: Promise<RedisClientType> | null = null;

  constructor(private readonly config: StateStoreConfig = loadStateStoreConfig()) {
    super();
  }

  async delete(key: string) {
    const client = await this.getClient();
    await client.del(key);
  }

  async get<T>(key: string) {
    const client = await this.getClient();
    const raw = await client.get(key);

    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw) as T;
  }

  async list(prefix: string) {
    const client = await this.getClient();
    const keys = await client.keys(`${prefix}*`);
    return keys.sort();
  }

  async onModuleDestroy() {
    if (!this.client?.isOpen) {
      return;
    }
    await this.client.quit();
  }

  async set<T>(key: string, value: T, options: StateStoreSetOptions = {}) {
    const client = await this.getClient();
    const payload = JSON.stringify(value);

    if (options.ttl_seconds === undefined) {
      await client.set(key, payload);
    } else {
      await client.set(key, payload, {
        EX: options.ttl_seconds
      });
    }

    return value;
  }

  private async getClient() {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }

    return this.connectPromise;
  }

  private async connect() {
    const client = createClient({
      url: this.config.redis_url
    });
    await client.connect();
    this.client = client;
    return client;
  }
}
