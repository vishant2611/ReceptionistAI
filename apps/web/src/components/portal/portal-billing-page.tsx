"use client";

import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

export function PortalBillingPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading billing workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  return (
    <PortalShell
      active="billing"
      portal={portal}
      subtitle="Plan, billing cycle, and invoice-facing ownership for the business account."
      title="Billing"
    >
      {portal.canViewBilling ? (
        <section className="grid-2">
          <div className="surface-card stack-md">
            <div className="page-intro">
              <span className="eyebrow">Plan</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Current billing</h2>
            </div>
            <div className="detail-list">
              <div className="detail-row"><span>Plan</span><strong>{portal.business.selectedPlan || "Free Trial"}</strong></div>
              <div className="detail-row"><span>Billing cycle</span><strong>{portal.business.billingCycle || "Monthly"}</strong></div>
              <div className="detail-row"><span>Portal role</span><strong>{portal.role.replaceAll("_", " ")}</strong></div>
            </div>
          </div>

          <div className="surface-card stack-md">
            <div className="page-intro">
              <span className="eyebrow">Next</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Upcoming billing work</h2>
            </div>
            <div className="detail-block">
              <h3>Planned features</h3>
              <p>Auto-pay, invoices, reminders, outstanding balances, and unpaid invoice enforcement.</p>
            </div>
          </div>
        </section>
      ) : (
        <div className="status-banner neutral">Your role does not have access to billing.</div>
      )}
    </PortalShell>
  );
}
