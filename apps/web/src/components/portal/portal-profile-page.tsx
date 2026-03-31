"use client";

import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

export function PortalProfilePage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading business profile...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  return (
    <PortalShell
      active="profile"
      portal={portal}
      subtitle="Review the current company information, contact details, and service summary."
      title="Business Profile"
    >
      <section className="grid-2">
        <div className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Company</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Core details</h2>
          </div>
          <div className="detail-list">
            <div className="detail-row"><span>Name</span><strong>{portal.business.name}</strong></div>
            <div className="detail-row"><span>Category</span><strong>{portal.business.category}</strong></div>
            <div className="detail-row"><span>Email</span><strong>{portal.business.email || "-"}</strong></div>
            <div className="detail-row"><span>Phone</span><strong>{portal.business.phoneNumber || "-"}</strong></div>
            <div className="detail-row"><span>Timezone</span><strong>{portal.business.timezone}</strong></div>
            <div className="detail-row"><span>Address</span><strong>{portal.business.address || "-"}</strong></div>
          </div>
        </div>

        <div className="surface-card stack-md">
          <div className="page-intro">
            <span className="eyebrow">Summary</span>
            <h2 className="section-title" style={{ marginTop: 14 }}>Services and pricing</h2>
          </div>
          <div className="detail-block">
            <h3>Business summary</h3>
            <p>{portal.business.description || "No summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Services summary</h3>
            <p>{portal.business.servicesSummary || "No services summary added yet."}</p>
          </div>
          <div className="detail-block">
            <h3>Price summary</h3>
            <p>{portal.business.priceListSummary || "No pricing summary added yet."}</p>
          </div>
        </div>
      </section>
    </PortalShell>
  );
}
