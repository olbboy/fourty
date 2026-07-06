import { ContactDetail } from "./contact-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactDetail id={id} />;
}
