import { PortalTelephonyPage } from "../../../components/portal/portal-telephony-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalTelephonyPage businessId={params.businessId} />;
}
