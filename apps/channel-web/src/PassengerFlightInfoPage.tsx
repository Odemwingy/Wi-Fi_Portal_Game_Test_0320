import { PassengerPortalShell } from "./PassengerPortalShell";
import { usePassengerBootstrap } from "./passenger-portal";

export function PassengerFlightInfoPage() {
  const { apiError, bootstrapData } = usePassengerBootstrap();

  return (
    <PassengerPortalShell
      activePath="/portal/flight-info"
      bootstrapData={bootstrapData}
    >
      <section className="portal-page-hero">
        <div>
          <p className="portal-kicker">Flight Overview</p>
          <h2>飞行信息</h2>
          <p className="portal-copy">
            测试仓库同样保留 Portal 式飞行信息页，方便验证导航、页面风格和乘客信息
            在 Docker 交付环境中的呈现。
          </p>
        </div>
        <div className="portal-stat-grid">
          <article className="portal-stat-card">
            <span>航司</span>
            <strong>{bootstrapData?.session.airlineCode ?? "MU"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>舱位</span>
            <strong>{bootstrapData?.session.cabinClass ?? "economy"}</strong>
          </article>
          <article className="portal-stat-card">
            <span>座位</span>
            <strong>{bootstrapData?.session.seatNumber ?? "32A"}</strong>
          </article>
        </div>
      </section>

      {apiError ? (
        <section className="portal-banner portal-banner-error">
          <strong>飞行信息加载失败：</strong>
          <span>{apiError}</span>
        </section>
      ) : null}

      <section className="portal-info-grid">
        <article className="portal-info-card">
          <p className="portal-kicker">Portal Status</p>
          <h3>当前测试环境</h3>
          <div className="portal-detail-list">
            <div>
              <span>Wi-Fi Portal</span>
              <strong>已连接</strong>
            </div>
            <div>
              <span>Game Channel</span>
              <strong>测试模式</strong>
            </div>
            <div>
              <span>Locale</span>
              <strong>{bootstrapData?.session.locale ?? "zh-CN"}</strong>
            </div>
            <div>
              <span>Session</span>
              <strong>{bootstrapData?.session.sessionId ?? "pending"}</strong>
            </div>
          </div>
        </article>

        <article className="portal-info-card">
          <p className="portal-kicker">Delivery Scope</p>
          <h3>本页用途</h3>
          <div className="portal-detail-list">
            <div>
              <span>定位</span>
              <strong>测试交付页</strong>
            </div>
            <div>
              <span>重点</span>
              <strong>前端风格和导航一致性</strong>
            </div>
            <div>
              <span>模式</span>
              <strong>静态导入游戏验证</strong>
            </div>
            <div>
              <span>建议</span>
              <strong>后续可替换为真实航班数据</strong>
            </div>
          </div>
        </article>
      </section>
    </PassengerPortalShell>
  );
}
