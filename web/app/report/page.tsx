import { Suspense } from "react";
import ReportClient from "./ReportClient";

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="page center">טוען…</div>}>
      <ReportClient />
    </Suspense>
  );
}
