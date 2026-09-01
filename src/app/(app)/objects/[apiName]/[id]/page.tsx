import { RecordDetail } from "./record-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ apiName: string }> }) {
  const { apiName } = await params;
  return { title: apiName };
}

export default async function CustomObjectDetailPage({
  params,
}: {
  params: Promise<{ apiName: string; id: string }>;
}) {
  const { apiName, id } = await params;
  return <RecordDetail apiName={apiName} id={id} />;
}
