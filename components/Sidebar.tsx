"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "../lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-56 flex-col gap-5 overflow-y-auto border-r border-slate-200 bg-slate-900 px-3 py-5 text-slate-200">
      <div className="px-2">
        <div className="text-sm font-semibold text-white">BOGT Portal</div>
        <div className="text-[11px] text-slate-400">Operations Intelligence</div>
      </div>
      {NAV_SECTIONS.map((section, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {section.label && (
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{section.label}</div>
          )}
          {section.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active ? "bg-slate-700 text-white font-medium" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
