import type { ReactNode } from "react";

import type { SessionBootstrapResponse } from "@wifi-portal/game-sdk";

type PortalNavItem = {
  href: string;
  label: string;
  meta: string;
};

const portalNavItems: PortalNavItem[] = [
  { href: "/", label: "首页", meta: "Portal" },
  { href: "/portal/games", label: "测试游戏", meta: "Catalog" },
  { href: "/portal/multiplayer", label: "测试资源", meta: "Assets" },
  { href: "/portal/flight-info", label: "飞行信息", meta: "Flight" }
];

type PassengerPortalShellProps = {
  activePath: string;
  bootstrapData: SessionBootstrapResponse | null;
  children: ReactNode;
};

export function PassengerPortalShell(props: PassengerPortalShellProps) {
  const { activePath, bootstrapData, children } = props;

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-brand">
          <div className="portal-brand-mark">MU</div>
          <div>
            <p className="portal-brand-eyebrow">In-Flight Wi-Fi Portal</p>
            <h1 className="portal-brand-title">Sky Journey Test Delivery</h1>
          </div>
        </div>

        <div className="portal-status-row">
          <div className="portal-status-chip">
            <span>航司</span>
            <strong>
              {bootstrapData?.session.airlineCode ?? "MU"} Test Channel
            </strong>
          </div>
          <div className="portal-status-chip">
            <span>座位</span>
            <strong>{bootstrapData?.session.seatNumber ?? "32A"}</strong>
          </div>
          <div className="portal-status-chip">
            <span>状态</span>
            <strong>Static Test Mode</strong>
          </div>
        </div>
      </header>

      <nav className="portal-nav">
        {portalNavItems.map((item) => (
          <a
            className={
              item.href === activePath
                ? "portal-nav-link portal-nav-link-active"
                : "portal-nav-link"
            }
            href={item.href}
            key={item.href}
          >
            <span>{item.label}</span>
            <small>{item.meta}</small>
          </a>
        ))}
      </nav>

      <div className="portal-content">{children}</div>
    </main>
  );
}
