"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { MembersSection } from "./sections/members";
import { SsoSection } from "./sections/sso";
import { MailboxSection } from "./sections/mailbox";
import { LanguageSection } from "./sections/language";
import { SecuritySection } from "./sections/security";
import { FieldPermissionsSection } from "./sections/field-permissions";
import { AuditLogSection } from "./sections/audit-log";
import { CustomFieldsSection } from "./sections/custom-fields";
import { CustomObjectsSection } from "./sections/custom-objects";
import { PipelinesSection } from "./sections/pipelines";
import { ReportingSection } from "./sections/reporting";
import { LostReasonSection } from "./sections/lost-reason";
import { RemindersSection } from "./sections/reminders";
import { TrashSection } from "./sections/trash";
import { ProductsSection } from "./sections/products";
import { ApiKeysSection } from "./sections/api-keys";
import { WebhooksSection } from "./sections/webhooks";
import { DiagnosticsSection } from "./sections/diagnostics";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export function SettingsClient({
  canManagePipelines = false,
  canManageProducts = false,
  isAdmin = false,
}: {
  canManagePipelines?: boolean;
  canManageProducts?: boolean;
  isAdmin?: boolean;
} = {}) {
  const t = useT();
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t("nav.settings")} subtitle={t("page.settings.subtitle")} />
      <MembersSection />
      <SsoSection />
      <MailboxSection />
      <PipelinesSection canManagePipelines={canManagePipelines} />
      <ProductsSection canEdit={canManageProducts} />
      {isAdmin && <LostReasonSection />}
      {isAdmin && <ReportingSection />}
      {isAdmin && <RemindersSection />}
      <TrashSection isAdmin={isAdmin} />
      <LanguageSection />
      <SecuritySection />
      <FieldPermissionsSection />
      <AuditLogSection />
      <CustomFieldsSection />
      <CustomObjectsSection />
      <ApiKeysSection />
      <WebhooksSection />
      <DiagnosticsSection />
      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("page.settings.dataImport")}</h2>
        <p className="mb-3 text-sm text-ink-muted">{t("page.settings.dataImportHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/import" className={cn(buttonVariants())}>
            <IconUpload width={15} height={15} /> {t("page.settings.importCsv")}
          </Link>
          <a href="/api/export/tasks" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("page.settings.exportTasks")}
          </a>
          <a href="/api/export/notes" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("page.settings.exportNotes")}
          </a>
        </div>
      </Card>
      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("page.settings.restApi")}</h2>
        <p className="text-sm text-ink-muted">
          {t("page.settings.restApiAuth")}{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            Authorization: Bearer &lt;api key&gt;
          </code>
          . {t("page.settings.restApiEndpoints")}{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            /api/contacts · /api/companies · /api/deals · /api/tasks · /api/notes · /api/activities
            · /api/workflows · /api/search · /api/stats/dashboard
          </code>{" "}
          {t("page.settings.restApiMethods")} {t("page.settings.restApiGraphql")}{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/graphql</code>
          {t("page.settings.restApiCustom")}{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/objects/&lt;name&gt;</code>
          . {t("page.settings.restApiReadme")}
        </p>
      </Card>
    </div>
  );
}
