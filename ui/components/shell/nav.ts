import { Box, Fingerprint, FlaskConical, LayoutGrid, Server, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/fleet", label: "Fleet", icon: Server },
  { href: "/lab", label: "Attack Lab", icon: FlaskConical },
  { href: "/ledger", label: "Ledger", icon: Fingerprint },
  { href: "/visuals", label: "Visuals", icon: Box },
];
