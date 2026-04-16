import { QaLabClient } from "@/components/qa-lab-client";

export const metadata = {
  title: "QA Lab — Lead Execution CRM",
};

/** Live browser test panel — pair with crm-api `CRM_QA_LAB=true` + `seed-qa`. */
export default function QaPage() {
  return (
    <div className="min-h-dvh bg-zinc-950">
      <QaLabClient />
    </div>
  );
}
