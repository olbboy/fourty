import { Suspense } from "react";
import { CompaniesClient } from "./companies-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <Suspense>
      <CompaniesClient />
    </Suspense>
  );
}
