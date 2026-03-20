import { useEffect, useMemo, useState } from "react";

import {
  portalHostLaunchContextMessageSchema,
  portalLaunchContextSchema,
  portalPackageReadyMessageSchema,
  portalPackageResizeMessageSchema,
  type PortalLaunchContext
} from "@wifi-portal/game-sdk";

export type PackageLaunchContext = PortalLaunchContext;

export function readPackageLaunchContext(search: string): PackageLaunchContext {
  const params = new URLSearchParams(search);

  return portalLaunchContextSchema.parse({
    airlineCode: params.get("airline_code") ?? "MU",
    cabinClass: params.get("cabin_class") ?? "economy",
    gameId: params.get("game_id") ?? "unknown-game",
    locale: params.get("locale") ?? "zh-CN",
    passengerId: params.get("passenger_id") ?? "unknown-passenger",
    roomId: params.get("room_id"),
    seatNumber: params.get("seat_number") ?? undefined,
    sessionId: params.get("session_id") ?? createClientId("package-session"),
    traceId: params.get("trace_id") ?? createClientId("package-trace")
  });
}

export function buildPackageFrameUrl(input: {
  gameId: string;
  route: string;
  search: string;
}) {
  const params = new URLSearchParams(input.search);
  params.set("game_id", input.gameId);
  params.set("portal_host", "1");

  return `${input.route}?${params.toString()}`;
}

export function usePackageLaunchContext(gameId: string) {
  const initialContext = useMemo(
    () => readPackageLaunchContext(window.location.search),
    []
  );
  const [launchContext, setLaunchContext] =
    useState<PackageLaunchContext>(initialContext);
  const portalHostEnabled = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("portal_host") === "1";
  }, []);

  useEffect(() => {
    if (!portalHostEnabled || window.parent === window) {
      return;
    }

    const handleMessage = (event: MessageEvent<unknown>) => {
      const parsed = portalHostLaunchContextMessageSchema.safeParse(event.data);
      if (!parsed.success) {
        return;
      }

      if (parsed.data.payload.launch_context.gameId !== gameId) {
        return;
      }

      setLaunchContext(parsed.data.payload.launch_context);
    };

    window.addEventListener("message", handleMessage);
    window.parent.postMessage(
      portalPackageReadyMessageSchema.parse({
        channel: "wifi-portal-portal",
        payload: {
          game_id: gameId
        },
        type: "portal.package.ready"
      }),
      "*"
    );

    const reportHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );

      window.parent.postMessage(
        portalPackageResizeMessageSchema.parse({
          channel: "wifi-portal-portal",
          payload: {
            game_id: gameId,
            height
          },
          type: "portal.package.resize"
        }),
        "*"
      );
    };

    reportHeight();
    const resizeObserver = new ResizeObserver(() => {
      reportHeight();
    });

    resizeObserver.observe(document.body);
    resizeObserver.observe(document.documentElement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("message", handleMessage);
    };
  }, [gameId, portalHostEnabled]);

  return {
    launchContext,
    portalHostEnabled
  };
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
