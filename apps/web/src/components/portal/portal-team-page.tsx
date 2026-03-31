"use client";

import { TeamManagement } from "../dashboard/team-management";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

export function PortalTeamPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading team workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  return (
    <PortalShell
      active="team"
      portal={portal}
      subtitle="Invite sub-users and manage who can access which parts of the business portal."
      title="Team Management"
    >
      {portal.canManageTeam ? (
        <TeamManagement businessId={portal.business.id} initialMembers={portal.members} />
      ) : (
        <div className="status-banner neutral">Only the business owner can manage team access.</div>
      )}
    </PortalShell>
  );
}
