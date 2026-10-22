import { LayoutDashboard, Compass, BriefcaseBusiness, ListChecks, Send, Radar, BarChart3, FileText, Settings, Info } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Compass, chip: "New" },
  { href: "/ops", label: "Review", icon: BriefcaseBusiness },
  { href: "/pipeline", label: "Pipeline", icon: ListChecks },
  { href: "/followups", label: "Follow-ups", icon: Send },
  { href: "/portals", label: "Sources", icon: Radar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/cv", label: "CV", icon: FileText },
  { href: "/config", label: "Settings", icon: Settings },
  { href: "/about", label: "About Tuloy", icon: Info },
];

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
