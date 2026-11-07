"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem, NavList } from "@yunseo/ui";

export interface NavEntry {
  href: string;
  label: string;
  count?: number;
  alert?: boolean;
  disabled?: boolean;
}

export function Nav({ items }: { items: NavEntry[] }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <NavList label="주 메뉴">
      {items.map((it) => (
        <NavItem key={it.href} as={Link} href={it.href} current={active(it.href)} disabled={it.disabled ?? false} count={it.count} alert={it.alert ?? false} title={it.label}>
          {it.label}
        </NavItem>
      ))}
    </NavList>
  );
}
