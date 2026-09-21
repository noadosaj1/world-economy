"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * The game's main navigation.
 *
 * Every phase of the roadmap has a home here. Sections that are not built yet
 * are shown but disabled and labelled "soon", so the shape of the game is
 * visible without pretending a mechanic exists.
 */

type NavItem = { href: string; label: string; icon: string; soon?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/world", label: "World", icon: "◈" },
  { href: "/company", label: "Company", icon: "▣" },
  { href: "/land", label: "Land", icon: "▦" },
  { href: "/build", label: "Build", icon: "⬢", soon: true },
  { href: "/inventory", label: "Inventory", icon: "▤", soon: true },
  { href: "/market", label: "Market", icon: "⇄", soon: true },
  { href: "/stocks", label: "Stocks", icon: "↗", soon: true },
  { href: "/property", label: "Property", icon: "⌂", soon: true },
  { href: "/vehicles", label: "Vehicles", icon: "⛟", soon: true },
  { href: "/advertising", label: "Advertising", icon: "◫", soon: true },
  { href: "/casino", label: "Casino", icon: "✦", soon: true },
  { href: "/leaderboard", label: "Leaderboard", icon: "☰", soon: true },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Game sections"
      className="flex gap-1 overflow-x-auto border-b border-ink-700/70 bg-ink-950/60 p-2 md:h-full md:w-56 md:flex-col md:overflow-y-auto md:border-r md:border-b-0"
    >
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (item.soon) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Coming in a later phase"
              className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-600"
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
              <span className="ml-auto hidden rounded-md bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 md:block">
                soon
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/40 ring-inset"
                : "text-slate-300 hover:bg-ink-800/70 hover:text-slate-100",
            )}
          >
            <span aria-hidden className="w-4 text-center">
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
