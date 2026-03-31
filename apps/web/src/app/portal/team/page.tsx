import { PortalTeamPage } from "../../../components/portal/portal-team-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalTeamPage businessId={params.businessId} />;
}
