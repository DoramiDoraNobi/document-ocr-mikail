"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DashboardSortKey =
  | "created_desc"
  | "created_asc"
  | "total_desc"
  | "total_asc"
  | "vendor_asc"
  | "vendor_desc";

const SORT_OPTIONS: Array<{ value: DashboardSortKey; label: string }> = [
  { value: "created_desc", label: "Terbaru" },
  { value: "created_asc", label: "Terlama" },
  { value: "total_desc", label: "Total terbesar" },
  { value: "total_asc", label: "Total terkecil" },
  { value: "vendor_asc", label: "Vendor A–Z" },
  { value: "vendor_desc", label: "Vendor Z–A" },
];

export default function SortSelect({ value }: { value: DashboardSortKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => {
    const p = new URLSearchParams(searchParams?.toString());
    return p;
  }, [searchParams]);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold text-gray-600">Urutkan</label>
      <select
        value={value}
        onChange={(e) => {
          const next = e.target.value as DashboardSortKey;
          params.set("sort", next);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
