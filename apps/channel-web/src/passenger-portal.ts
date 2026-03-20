import { useEffect, useMemo, useState } from "react";

import type {
  ChannelCatalogEntry,
  SessionBootstrapResponse
} from "@wifi-portal/game-sdk";

import { bootstrapSession } from "./channel-api";

export const DEFAULT_BOOTSTRAP = {
  airline_code: "MU",
  cabin_class: "economy",
  locale: "zh-CN",
  seat_number: "32A"
} as const;

export function usePassengerBootstrap() {
  const [bootstrapData, setBootstrapData] =
    useState<SessionBootstrapResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setApiError(null);

    void bootstrapSession(DEFAULT_BOOTSTRAP)
      .then((response) => {
        setBootstrapData(response);
      })
      .catch((error: unknown) => {
        setApiError(error instanceof Error ? error.message : "频道初始化失败");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const catalogEntries = useMemo(
    () => bootstrapData?.catalog ?? [],
    [bootstrapData?.catalog]
  );

  return {
    apiError,
    bootstrapData,
    catalogEntries,
    isLoading
  };
}

export function getFilteredGames(
  entries: ChannelCatalogEntry[],
  allowedGameIds: Set<string>
) {
  return entries.filter((entry) => allowedGameIds.has(entry.game_id));
}

export function getGameAccent(entry: ChannelCatalogEntry): string {
  if (entry.game_id.includes("globe")) {
    return "portal-card-accent-cyan";
  }

  if (entry.points_enabled) {
    return "portal-card-accent-gold";
  }

  return "portal-card-accent-mint";
}
