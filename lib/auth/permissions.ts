import type { UserRole } from "@prisma/client";

/**
 * Role-based access control (spec section 42). Roles: Admin, Inventory
 * Manager, Purchasing, Warehouse, Finance, Viewer.
 *
 * Example from the spec: "Warehouse should be able to work with Stock
 * IN/OUT but should not change financial settings. Purchasing can create
 * purchase orders. Admin controls system settings."
 *
 * Permissions are coarse capability flags checked both by the UI (to hide
 * actions a role can't perform) and by every Server Action that mutates
 * data (never trust the client — the UI hiding a button is a courtesy, the
 * Server Action check is the actual gate).
 */
export type Permission =
  | "view_all" // every role can view; kept explicit for clarity
  | "manage_stock_movements" // Stock IN/OUT, warehouse adjustments
  | "manage_products" // edit product master fields
  | "manage_suppliers"
  | "upload_supplier_price_lists"
  | "create_purchase_plans"
  | "approve_purchase_plans"
  | "create_purchase_orders"
  | "manage_invoices"
  | "manage_settings" // business rules, thresholds, VAT/fee config
  | "manage_users"
  | "run_sheet_sync"
  | "review_matching_queue"
  | "export_reports";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "view_all",
    "manage_stock_movements",
    "manage_products",
    "manage_suppliers",
    "upload_supplier_price_lists",
    "create_purchase_plans",
    "approve_purchase_plans",
    "create_purchase_orders",
    "manage_invoices",
    "manage_settings",
    "manage_users",
    "run_sheet_sync",
    "review_matching_queue",
    "export_reports",
  ],
  INVENTORY_MANAGER: [
    "view_all",
    "manage_stock_movements",
    "manage_products",
    "create_purchase_plans",
    "approve_purchase_plans",
    "run_sheet_sync",
    "review_matching_queue",
    "export_reports",
  ],
  PURCHASING: [
    "view_all",
    "manage_suppliers",
    "upload_supplier_price_lists",
    "create_purchase_plans",
    "create_purchase_orders",
    "manage_invoices",
    "review_matching_queue",
    "export_reports",
  ],
  WAREHOUSE: ["view_all", "manage_stock_movements", "export_reports"],
  FINANCE: ["view_all", "manage_invoices", "export_reports"],
  VIEWER: ["view_all"],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertCan(role: UserRole, permission: Permission) {
  if (!can(role, permission)) {
    throw new Error(`Forbidden: role ${role} lacks permission "${permission}"`);
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  INVENTORY_MANAGER: "Inventory Manager",
  PURCHASING: "Purchasing",
  WAREHOUSE: "Warehouse",
  FINANCE: "Finance",
  VIEWER: "Viewer",
};
