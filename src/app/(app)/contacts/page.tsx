import { Suspense } from "react";
import { ContactsClient } from "./contacts-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <Suspense>
      <ContactsClient />
    </Suspense>
  );
}
