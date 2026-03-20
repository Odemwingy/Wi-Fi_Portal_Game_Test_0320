import { useMemo } from "react";

import {
  usePackageLaunchContext
} from "./package-launch-context";

type StaticHtmlGamePackagePageProps = {
  description: string;
  displayName: string;
  gameId: string;
  notes: string[];
  staticPath: string;
};

export function StaticHtmlGamePackagePage(props: StaticHtmlGamePackagePageProps) {
  const { launchContext, portalHostEnabled } = usePackageLaunchContext(props.gameId);
  const frameUrl = useMemo(() => {
    const url = new URL(props.staticPath, window.location.origin);

    url.searchParams.set("airline_code", launchContext.airlineCode);
    url.searchParams.set("cabin_class", launchContext.cabinClass);
    url.searchParams.set("game_id", props.gameId);
    url.searchParams.set("locale", launchContext.locale);
    url.searchParams.set("passenger_id", launchContext.passengerId);
    url.searchParams.set("session_id", launchContext.sessionId);
    url.searchParams.set("trace_id", launchContext.traceId);

    if (launchContext.roomId) {
      url.searchParams.set("room_id", launchContext.roomId);
    }

    if (launchContext.seatNumber) {
      url.searchParams.set("seat_number", launchContext.seatNumber);
    }

    return url.toString();
  }, [launchContext, props.gameId, props.staticPath]);

  return (
    <main className="package-shell">
      <section className="package-hero">
        <div>
          <p className="eyebrow">External Static Test Package</p>
          <h1>{props.displayName}</h1>
          <p className="lede">{props.description}</p>
        </div>

        <div className="hero-stats">
          <article className="stat-chip accent-sea">
            <span>Game ID</span>
            <strong>{props.gameId}</strong>
          </article>
          <article className="stat-chip accent-sun">
            <span>Passenger</span>
            <strong>{launchContext.passengerId}</strong>
          </article>
          <article className="stat-chip accent-mint">
            <span>Seat</span>
            <strong>{launchContext.seatNumber ?? "-"}</strong>
          </article>
          <article className="stat-chip accent-rose">
            <span>Host Mode</span>
            <strong>{portalHostEnabled ? "portal-host" : "standalone"}</strong>
          </article>
        </div>
      </section>

      <section className="package-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Launch Context</p>
              <h2>集成上下文</h2>
            </div>
            <a className="action-button" href="/">
              返回频道页
            </a>
          </div>

          <div className="launcher-meta-grid">
            <div className="quiz-meta-card">
              <span>Source</span>
              <strong>globe-games-test</strong>
              <p>静态 HTML 测试包，直接随 channel-web 一起交付。</p>
            </div>
            <div className="quiz-meta-card">
              <span>Locale</span>
              <strong>{launchContext.locale}</strong>
              <p>
                {launchContext.airlineCode} / {launchContext.cabinClass}
              </p>
            </div>
            <div className="quiz-meta-card">
              <span>Session</span>
              <strong>{launchContext.sessionId}</strong>
              <p>room_id {launchContext.roomId ?? "not required"}</p>
            </div>
            <div className="quiz-meta-card">
              <span>Asset Path</span>
              <strong>{props.staticPath}</strong>
              <p>iframe 内加载静态资源，不依赖 platform runtime。</p>
            </div>
          </div>

          <div className="json-card">
            <p className="mini-label">launch context</p>
            <pre>{JSON.stringify(launchContext, null, 2)}</pre>
          </div>

          <div className="static-package-note-list">
            {props.notes.map((note) => (
              <article className="activity-item tone-info" key={note}>
                <div className="activity-topline">
                  <strong>{note}</strong>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel panel-span-2">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Package Runtime</p>
              <h2>{props.displayName} 静态包预览</h2>
            </div>
            <a
              className="action-button action-button-primary"
              href={frameUrl}
              rel="noreferrer"
              target="_blank"
            >
              新标签打开原始页面
            </a>
          </div>

          <div className="static-package-frame-shell">
            <iframe
              className="static-package-frame"
              src={frameUrl}
              title={`${props.displayName} static package`}
            />
          </div>
        </article>
      </section>
    </main>
  );
}
