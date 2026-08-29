import { RecordsClient } from "./records-client";

export const dynamic = "force-dynamic";

// The object's display name lives in the database; the client resolves it and
// renders the real title. The document title just carries the slug.
export async function generateMetadata({ params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  return { title: object };
}

export default async function ObjectRecordsPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
  return <RecordsClient apiName={object} />;
}
