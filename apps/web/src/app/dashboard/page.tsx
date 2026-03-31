import { redirect } from "next/navigation";

type DashboardRedirectProps = {
  searchParams: Promise<{
    businessId?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardRedirectProps) {
  const params = await searchParams;
  const target = params.businessId ? `/portal/dashboard?businessId=${params.businessId}` : "/portal/dashboard";
  redirect(target);
}
