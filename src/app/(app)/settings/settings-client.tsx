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
import { ApiKeysSection } from "./sections/api-keys";
import { WebhooksSection } from "./sections/webhooks";
import { DiagnosticsSection } from "./sections/diagnostics";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export function SettingsClient() {
  const t = useT();
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title={t("nav.settings")} subtitle={t("page.settings.subtitle")} />
      <MembersSection />
      <SsoSection />
      <MailboxSection />
      <PipelinesSection />
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
        <Link href="/settings/import" className={cn(buttonVariants())}>
          <IconUpload width={15} height={15} /> {t("page.settings.importCsv")}
        </Link>
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
