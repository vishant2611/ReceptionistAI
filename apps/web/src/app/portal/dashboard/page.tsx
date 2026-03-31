import { PortalDashboardPage } from "../../../components/portal/portal-dashboard-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalDashboardPage businessId={params.businessId} />;
}
