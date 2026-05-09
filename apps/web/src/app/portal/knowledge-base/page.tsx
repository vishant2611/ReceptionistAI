import { PortalKnowledgeBasePage } from "../../../components/portal/portal-knowledge-base-page";

type Props = {
  searchParams: Promise<{ businessId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const params = await searchParams;
  return <PortalKnowledgeBasePage businessId={params.businessId} />;
}
