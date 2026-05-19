import { PortalCalendarPage } from "../../../components/portal/portal-calendar-page";

type Props = {
  searchParams: Promise<{ businessId?: string; connected?: string; error?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <PortalCalendarPage
      businessId={params.businessId}
      connectedProvider={params.connected}
      errorMessage={params.error}
    />
  );
}
