"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { MembersSection } from "./sections/members";
import { SsoSection } from "./sections/sso";
import { MailboxSection } from "./sections/mailbox";
import { LanguageSection } from "./sections/language";
import { CustomFieldsSection } from "./sections/custom-fields";
import { ApiKeysSection } from "./sections/api-keys";
import { DiagnosticsSection } from "./sections/diagnostics";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SettingsClient() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Team, single sign-on, mailboxes, custom fields, API access, diagnostics, and data tools."
      />
      <MembersSection />
      <SsoSection />
      <MailboxSection />
      <LanguageSection />
      <CustomFieldsSection />
      <ApiKeysSection />
      <DiagnosticsSection />
      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">Data import</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Bring your book of business from any CRM — CSV import auto-maps common column names and
          links or creates companies on the fly.
        </p>
        <Link href="/settings/import" className={cn(buttonVariants())}>
          <IconUpload width={15} height={15} /> Import contacts from CSV
        </Link>
      </Card>
      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">REST API</h2>
        <p className="text-sm text-ink-muted">
          Every resource in Fourty is available over a clean REST API — authenticate with{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            Authorization: Bearer &lt;api key&gt;
          </code>
          . Endpoints:{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            /api/contacts · /api/companies · /api/deals · /api/tasks · /api/notes · /api/activities
            · /api/workflows · /api/search · /api/stats/dashboard
          </code>{" "}
          with GET/POST/PATCH/DELETE. A typed <strong>GraphQL</strong> API for every object is at{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/graphql</code>, and no-code{" "}
          <strong>custom objects</strong> are served at{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/objects/&lt;name&gt;</code>.
          Full examples in the README.
        </p>
      </Card>
    </div>
  );
}
