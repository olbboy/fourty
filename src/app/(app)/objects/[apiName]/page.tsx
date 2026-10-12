import { Suspense } from "react";
import { RecordsClient } from "./records-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ apiName: string }> }) {
  const { apiName } = await params;
  return { title: apiName };
}

export default async function CustomObjectListPage({ params }: { params: Promise<{ apiName: string }> }) {
  const { apiName } = await params;
  return (
    <Suspense>
      <RecordsClient apiName={apiName} />
    </Suspense>
  );
}
