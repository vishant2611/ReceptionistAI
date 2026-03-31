import { PortalCallLogsPage } from "../../../components/portal/portal-call-logs-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalCallLogsPage businessId={params.businessId} />;
}
