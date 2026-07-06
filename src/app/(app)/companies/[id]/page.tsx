import { CompanyDetail } from "./company-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company" };

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetail id={id} />;
}
