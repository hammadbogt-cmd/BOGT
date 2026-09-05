"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Global instant search (spec section 28): barcode, ASIN, SKU, title, brand, supplier, invoice #, PO #, shipment ref. */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="w-full max-w-md"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search barcode, ASIN, SKU, title, brand, invoice, PO..."
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />
    </form>
  );
}
