"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  no: string;
  count?: number;
  disabled?: boolean;
}

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="nav" aria-label="주 메뉴">
      <div className="nav-label">Studio</div>
      {items.map((it) =>
        it.disabled ? (
          <span key={it.href} className="nav-disabled" style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", height: 32, alignItems: "center", padding: "0 8px", color: "var(--c-text-mute)", opacity: 0.6 }} title="다음 단계(M2)">
            <span className="no">{it.no}</span>
            <span className="label">{it.label}</span>
            <span />
          </span>
        ) : (
          <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined} title={it.label}>
            <span className="no">{it.no}</span>
            <span className="label">{it.label}</span>
            <span className="count">{it.count ? it.count : ""}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
