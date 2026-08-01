"use client";

import ky from "ky";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { dashboardSnapshotSchema } from "@/lib/dashboard-schema";

export function SalesAutoRefresh({ initialVersion }: { initialVersion: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const value = await ky.get("/api/dashboard/snapshot", { cache: "no-store" }).json();
      const snapshot = dashboardSnapshotSchema.parse(value);
      if (snapshot.salesVersion !== initialVersion) router.refresh();
    } finally {
      setChecking(false);
    }
  }, [initialVersion, router]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [check]);

  return <span className="sales-live">
    <i aria-hidden="true" />새 매출 버전만 60초 확인
    <button className="refresh-now" disabled={checking} onClick={() => void check()} type="button">{checking ? "확인 중" : "지금 확인"}</button>
  </span>;
}
