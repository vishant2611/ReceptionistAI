import { PortalPharmacyRefillsPage } from "../../../components/portal/portal-pharmacy-refills-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalPharmacyRefillsPage businessId={params.businessId} />;
}
