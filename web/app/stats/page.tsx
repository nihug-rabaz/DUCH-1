"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiPost, hasSession } from "@/lib/session";

export default function StatsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<{
    future_count: number;
    user_name: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    (async () => {
      const result = await apiPost<{
        user_name?: string;
        future_reports?: unknown[];
        error?: string;
        auth_expired?: boolean;
      }>("/api/home/summary");
      if (!result.ok) {
        setError(result.data.error || "שגיאה בטעינת נתונים");
        if (result.data.auth_expired) router.replace("/login");
        return;
      }
      setSummary({
        user_name: result.data.user_name || "",
        future_count: (result.data.future_reports || []).length,
      });
    })();
  }, [router]);

  return (
    <AppShell showBack>
      <main className="page stack">
        <h1 className="welcome-title">ירוק בעיניים</h1>
        <p className="help center">מבט מהיר על הסשן והדיווחים העתידיים.</p>

        {summary ? (
          <div className="card-panel stack">
            <div className="list-item">
              <div className="meta">
                <strong>משתמש</strong>
                <span>{summary.user_name || "—"}</span>
              </div>
            </div>
            <div className="list-item">
              <div className="meta">
                <strong>דיווחים עתידיים</strong>
                <span>{summary.future_count}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="notice info center">טוען…</div>
        )}

        {error ? <div className="notice error">{error}</div> : null}
      </main>
    </AppShell>
  );
}
