import { PortalSettingsPage } from "../../../components/portal/portal-settings-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalSettingsPage businessId={params.businessId} />;
}
