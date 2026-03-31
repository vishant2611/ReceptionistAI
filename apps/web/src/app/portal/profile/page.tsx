import { PortalProfilePage } from "../../../components/portal/portal-profile-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalProfilePage businessId={params.businessId} />;
}
