import { PortalMenuPage } from "../../../components/portal/portal-menu-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalMenuPage businessId={params.businessId} />;
}
