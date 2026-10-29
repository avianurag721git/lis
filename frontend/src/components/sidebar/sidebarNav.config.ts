import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Beaker,
  Building2,
  ClipboardList,
  Cpu,
  FileText,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  Microscope,
  Package,
  Shield,
  Stethoscope,
  Truck,
  Wallet
} from "lucide-react";
import type { Permission } from "../../modules/auth/permissions";

export type SidebarBadgeKey = "pathologist" | "labReceiving" | "reagentsLow" | "resultEntry";

export type SidebarNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badgeKey?: SidebarBadgeKey;
  superAdminOnly?: boolean;
  requiredPermission?: Permission | Permission[];
  matchPaths?: string[];
};

export type SidebarNavGroup = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  items: SidebarNavItem[];
};

export const SIDEBAR_NAV_GROUPS: SidebarNavGroup[] = [
  {
    id: "clinical",
    title: "Clinical Workflows",
    defaultOpen: true,
    items: [
      {
        to: "/orders",
        label: "Orders & Patients",
        icon: ClipboardList,
        requiredPermission: ["PATIENT_MANAGE", "ORDER_CREATE"],
        matchPaths: ["/patients", "/orders"]
      },
      {
        to: "/phlebotomy",
        label: "Phlebotomy & Logistics",
        icon: Truck,
        requiredPermission: "SAMPLE_COLLECT"
      },
      {
        to: "/lab-receiving",
        label: "Lab Receiving",
        icon: Beaker,
        badgeKey: "labReceiving",
        requiredPermission: "SAMPLE_RECEIVE"
      },
      {
        to: "/lab-results",
        label: "Result Entry Grid",
        icon: FlaskConical,
        badgeKey: "resultEntry",
        requiredPermission: "RESULT_ENTRY"
      },
      {
        to: "/pathologist",
        label: "Pathologist Approval",
        icon: Stethoscope,
        badgeKey: "pathologist",
        requiredPermission: "PATHOLOGIST_VERIFY"
      }
    ]
  },
  {
    id: "financials",
    title: "Financials & B2B",
    defaultOpen: true,
    items: [
      {
        to: "/billing",
        label: "Billing & invoices",
        icon: Wallet,
        requiredPermission: "BILLING_CREATE",
        matchPaths: ["/billing", "/payments"]
      },
      {
        to: "/b2b",
        label: "B2B Franchisees",
        icon: Building2,
        requiredPermission: "B2B_WALLET_MANAGE"
      },
      {
        to: "/analytics/referrals",
        label: "Referral Analytics",
        icon: BarChart3,
        requiredPermission: "ANALYTICS_VIEW"
      }
    ]
  },
  {
    id: "laboratory",
    title: "Laboratory & Instruments",
    defaultOpen: true,
    items: [
      {
        to: "/instruments",
        label: "Machine Interfacing",
        icon: Cpu,
        requiredPermission: "QC_MANAGE",
        matchPaths: ["/instruments"]
      },
      {
        to: "/inventory-qc?tab=inventory",
        label: "Reagent Inventory",
        icon: Microscope,
        badgeKey: "reagentsLow",
        requiredPermission: "REAGENT_MANAGE"
      },
      {
        to: "/inventory-qc?tab=qc",
        label: "Quality Control",
        icon: Activity,
        requiredPermission: "QC_MANAGE"
      }
    ]
  },
  {
    id: "saas",
    title: "SaaS & System",
    defaultOpen: true,
    items: [
      {
        to: "/",
        label: "Executive Dashboard",
        icon: LayoutDashboard,
        end: true,
        requiredPermission: "ANALYTICS_VIEW"
      },
      {
        to: "/pathologist",
        label: "PDF Reports & WhatsApp",
        icon: FileText,
        requiredPermission: "PATHOLOGIST_VERIFY",
        matchPaths: ["/pathologist", "/reports"]
      },
      {
        to: "/settings/catalog",
        label: "Test Catalog",
        icon: Package,
        requiredPermission: "SETTINGS_MANAGE",
        matchPaths: ["/settings/catalog", "/settings/test-studio"]
      },
      {
        to: "/settings/permissions",
        label: "Role & Permission Settings",
        icon: KeyRound,
        requiredPermission: "SETTINGS_MANAGE"
      },
      {
        to: "/settings/tenant",
        label: "Tenant & Report Layout",
        icon: Building2,
        requiredPermission: "SETTINGS_MANAGE"
      },
      {
        to: "/operations",
        label: "Operations Console",
        icon: Activity,
        requiredPermission: "SETTINGS_MANAGE"
      },
      {
        to: "/audit-logs",
        label: "Audit Logs",
        icon: Shield,
        requiredPermission: "SETTINGS_MANAGE"
      },
      { to: "/saas-admin", label: "SaaS Admin", icon: Building2, superAdminOnly: true }
    ]
  }
];
