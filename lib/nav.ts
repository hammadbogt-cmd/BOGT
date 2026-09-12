export interface NavItem {
  label: string;
  href: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/** Main navigation (spec section 37), grouped for readability in the sidebar. */
export const NAV_SECTIONS: NavSection[] = [
  { items: [{ label: "Dashboard", href: "/dashboard" }] },
  {
    label: "Inventory",
    items: [
      { label: "Amazon Inventory", href: "/inventory/amazon" },
      { label: "Listing Status", href: "/listing-status" },
      { label: "Warehouse Inventory", href: "/inventory/warehouse" },
      { label: "Stock Movements", href: "/stock-movements" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Reorder Center", href: "/reorder-center" },
      { label: "Purchase Plans", href: "/purchase-plans" },
      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "Purchase History", href: "/purchase-history" },
      { label: "Invoices", href: "/invoices" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/products" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Supplier Price Lists", href: "/supplier-price-lists" },
      { label: "Supplier Comparison", href: "/supplier-comparison" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Alerts", href: "/alerts" },
      { label: "Reports", href: "/reports" },
      { label: "Matching Review", href: "/matching-review" },
      { label: "Import & Sync", href: "/import-sync" },
    ],
  },
  { items: [{ label: "Settings", href: "/settings" }] },
];
