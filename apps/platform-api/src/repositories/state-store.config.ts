export type StateStoreBackend = "memory" | "redis";

export type StateStoreConfig = {
  backend: StateStoreBackend;
  redis_url: string;
};

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

export const loadStateStoreConfig = (
  env: NodeJS.ProcessEnv = process.env
): StateStoreConfig => {
  const backend = env.STATE_STORE_BACKEND ?? "memory";

  if (backend !== "memory" && backend !== "redis") {
    throw new Error(
      `Unsupported STATE_STORE_BACKEND: ${backend}. Expected 'memory' or 'redis'.`
    );
  }

  return {
    backend,
    redis_url: env.REDIS_URL ?? DEFAULT_REDIS_URL
  };
};
