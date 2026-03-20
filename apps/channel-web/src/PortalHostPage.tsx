import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  portalHostLaunchContextMessageSchema,
  portalMessageSchema,
  type PortalLaunchContext
} from "@wifi-portal/game-sdk";

import {
  buildPackageFrameUrl,
  readPackageLaunchContext
} from "./package-launch-context";

type BridgeEvent = {
  id: string;
  summary: string;
  timestamp: string;
};

export function PortalHostPage() {
  const [frameHeight, setFrameHeight] = useState(960);
  const [bridgeEvents, setBridgeEvents] = useState<BridgeEvent[]>([]);
  const [packageReady, setPackageReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const launchContext = useMemo<PortalLaunchContext>(
    () => readPackageLaunchContext(window.location.search),
    []
  );
  const route = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("route") ?? `/games/${launchContext.gameId}`;
  }, [launchContext.gameId]);
  const frameUrl = useMemo(
    () =>
      buildPackageFrameUrl({
        gameId: launchContext.gameId,
        route,
        search: window.location.search
      }),
    [launchContext.gameId, route]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const parsed = portalMessageSchema.safeParse(event.data);
      if (!parsed.success) {
        return;
      }

      switch (parsed.data.type) {
        case "portal.package.ready": {
          if (parsed.data.payload.game_id !== launchContext.gameId) {
            return;
          }

          iframeRef.current?.contentWindow?.postMessage(
            portalHostLaunchContextMessageSchema.parse({
              channel: "wifi-portal-portal",
              payload: {
                launch_context: launchContext
              },
              type: "portal.host.launch-context"
            }),
            "*"
          );
          setPackageReady(true);
          appendBridgeEvent(setBridgeEvents, `已向 ${launchContext.gameId} 注入 launch context`);
          return;
        }

        case "portal.package.resize":
          if (parsed.data.payload.game_id !== launchContext.gameId) {
            return;
          }

          setFrameHeight(Math.max(720, parsed.data.payload.height + 24));
          appendBridgeEvent(
            setBridgeEvents,
            `收到 ${parsed.data.payload.game_id} 高度同步 ${parsed.data.payload.height}px`
          );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [launchContext]);

  return (
    <main className="shell">
      <section className="hero-panel package-hero">
        <div className="hero-copy">
          <p className="eyebrow">Portal Host Shell</p>
          <h1>游戏宿主容器与会话注入契约</h1>
          <p className="lede">
            这个页面模拟 Wi-Fi Portal 宿主壳。它负责承载 package iframe，并通过
            `postMessage` 向子页面注入 launch context。
          </p>
        </div>

        <div className="hero-stats">
          <article className="stat-chip accent-sea">
            <span>Game</span>
            <strong>{launchContext.gameId}</strong>
          </article>
          <article className="stat-chip accent-sun">
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Bridge</span>
            <strong>{packageReady ? "ready" : "waiting"}</strong>
          </article>
        </div>
      </section>

      <section className="dashboard">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Portal Context</p>
              <h2>宿主注入上下文</h2>
            </div>
            <span className="pill">{launchContext.roomId ? "room-scoped" : "session-scoped"}</span>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Route</span>
              <strong>{route}</strong>
              <p>由宿主壳承载并注入到 package iframe</p>
            </div>
            <div className="quiz-meta-card">
              <span>Trace</span>
              <strong>{launchContext.traceId}</strong>
              <p>供子包继承</p>
            </div>
            <div className="quiz-meta-card">
              <span>Seat</span>
              <strong>{launchContext.seatNumber ?? "-"}</strong>
              <p>{launchContext.airlineCode} / {launchContext.cabinClass}</p>
            </div>
          </div>

          <div className="json-card">
            <p className="mini-label">portal launch context</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Embedded Package</p>
              <h2>Portal 内嵌游戏页</h2>
            </div>
            <span className="pill">{packageReady ? "context injected" : "waiting ready"}</span>
          </div>

          <div className="portal-frame-shell">
            <div className="portal-frame-bar">
              <strong>{launchContext.gameId}</strong>
              <span>{frameUrl}</span>
            </div>
            <iframe
              className="portal-frame"
              ref={iframeRef}
              src={frameUrl}
              style={{ height: `${frameHeight}px` }}
              title={`${launchContext.gameId} portal host preview`}
            />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Bridge Feed</p>
              <h2>宿主事件流</h2>
            </div>
          </div>

          <div className="activity-list">
            {bridgeEvents.length === 0 ? (
              <div className="empty-state compact">
                <h3>等待 package ready</h3>
                <p>iframe 发出 ready / resize 后，这里会显示桥接事件。</p>
              </div>
            ) : (
              bridgeEvents.map((item) => (
                <article className="activity-item tone-info" key={item.id}>
                  <div className="activity-topline">
                    <strong>{item.summary}</strong>
                    <span>{item.timestamp}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function appendBridgeEvent(
  setter: Dispatch<SetStateAction<BridgeEvent[]>>,
  summary: string
) {
  setter((current) => [
    {
      id: `portal-${Math.random().toString(36).slice(2, 10)}`,
      summary,
      timestamp: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    },
    ...current
  ].slice(0, 12));
}
