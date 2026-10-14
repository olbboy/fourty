import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/provider";
import { requestLocale } from "@/lib/i18n/request-locale";
import { QuoteSheet } from "./quote-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quote" };

/**
 * A quote as a printable page (D16): outside the app's chrome so printing it,
 * or saving it as PDF from the browser, gives just the quote. Members only.
 */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) redirect("/login");
  const { id } = await params;
  return (
    <LocaleProvider locale={await requestLocale()}>
      <QuoteSheet id={id} />
    </LocaleProvider>
  );
}
