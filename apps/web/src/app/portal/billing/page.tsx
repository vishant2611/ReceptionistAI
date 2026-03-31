import { PortalBillingPage } from "../../../components/portal/portal-billing-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalBillingPage businessId={params.businessId} />;
}
