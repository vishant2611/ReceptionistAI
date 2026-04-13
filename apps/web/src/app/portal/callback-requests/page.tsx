import { PortalPharmacyCallbacksPage } from "../../../components/portal/portal-pharmacy-callbacks-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalPharmacyCallbacksPage businessId={params.businessId} />;
}
