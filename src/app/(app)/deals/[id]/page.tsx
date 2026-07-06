import { DealDetail } from "./deal-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deal" };

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealDetail id={id} />;
}
