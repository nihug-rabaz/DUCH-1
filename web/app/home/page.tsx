"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiPost, getSession, hasSession } from "@/lib/session";

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function HomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [futureCount, setFutureCount] = useState(0);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const deadline = useMemo(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    if (Date.now() > d.getTime()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    const session = getSession();
    setUserName(session?.userName || "");
    (async () => {
      const result = await apiPost<{
        user_name?: string;
        future_reports?: unknown[];
        error?: string;
        auth_expired?: boolean;
      }>("/api/home/summary");
      if (!result.ok) {
        setError(result.data.error || "לא ניתן לטעון סיכום");
        if (result.data.auth_expired) router.replace("/login");
        return;
      }
      if (result.data.user_name) setUserName(result.data.user_name);
      setFutureCount((result.data.future_reports || []).length);
    })();
  }, [router]);

  const left = formatCountdown(deadline - now);

  return (
    <AppShell>
      <section className="welcome-section">
        <div className="welcome-content">
          {userName ? <div className="welcome-user">שלום, {userName}</div> : null}
          <h1 className="welcome-title">מה הסטטוס היום?</h1>
          <div className="time-left">
            נותרו עוד <span>{left}</span> לשליחת הדיווח
          </div>

          <div className="home-hero">
            <div className="home-hero-label">פעולה ראשית</div>
            <div className="home-hero-title">דיווח נוכחות לבסיס</div>
            <Link href="/report?mode=base" className="location-status-btn" aria-label="אני בבסיס">
              <span className="location-status-inner">
                <span className="icon">
                  <Image src="/img/basis.png" alt="" width={50} height={50} unoptimized />
                </span>
                <span className="text">
                  אני
                  <br />
                  בבסיס
                </span>
              </span>
            </Link>
          </div>

          <div className="home-actions">
            <Link href="/report?mode=other" className="btn-general welcome">
              <Image className="icon" src="/img/locationBtn.png" alt="" width={17} height={20} unoptimized />
              אני במקום אחר
            </Link>

            <Link href="/calendar" className="btn-general welcome">
              <Image className="icon" src="/img/futureReport.png" alt="" width={17} height={17} unoptimized />
              דיווחים עתידיים{futureCount ? ` (${futureCount})` : ""}
            </Link>

            <Link href="/stats" className="btn-general welcome emergency practice">
              <Image
                className="icon"
                src="/img/emergencyPractice.png"
                alt=""
                width={17}
                height={17}
                unoptimized
              />
              ירוק בעיניים
            </Link>
          </div>

          {error ? <div className="notice error">{error}</div> : null}
        </div>
      </section>
    </AppShell>
  );
}
