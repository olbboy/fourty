import { applyCustomFieldValues, type FieldDef } from "@/lib/records";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

/**
 * Reading deals out of a spreadsheet (D14): which column is which, what a cell
 * means, and what each row would become. Pure: the route gathers the lookups,
 * this decides, so a dry run and the real import read every row the same way.
 */

/** A header or name as compared: no case, no Vietnamese marks, letters and digits only. */
export function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const COLUMNS = {
  name: ["name", "deal", "dealname", "ten", "tendeal", "tenthuongvu"],
  amount: ["amount", "value", "dealvalue", "giatri", "sotien", "giatrideal"],
  currency: ["currency", "tiente", "donvitien"],
  pipeline: ["pipeline", "quytrinh"],
  stage: ["stage", "giaidoan", "buoc"],
  close: ["expectedclosedate", "closedate", "expectedclose", "ngaydukienky", "ngayky", "dukienky"],
  owner: ["owner", "owneremail", "nguoiphutrach", "phutrach"],
  company: ["company", "companyname", "congty", "khachhang"],
  contact: ["contact", "contactemail", "email", "lienhe", "emaillienhe"],
} as const;
type Column = keyof typeof COLUMNS;

/** The cell of a row for one of the built-in columns, or "" when absent. */
function cell(row: Record<string, string>, column: Column): string {
  const aliases: readonly string[] = COLUMNS[column];
  for (const key of Object.keys(row)) if (aliases.includes(normText(key))) return row[key]!.trim();
  return "";
}

const BUILTIN = new Set<string>(Object.values(COLUMNS).flat());

/**
 * An amount as people type it: "20.000.000.000" and "20,000,000,000" are
 * twenty billion; "1500.5" and "1500,5" a decimal. undefined when empty,
 * NaN when it is not a number.
 */
export function parseAmount(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "");
  if (!s) return undefined;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  return /^\d+([.,]\d+)?$/.test(s) ? Number(s.replace(",", ".")) : Number.NaN;
}

/**
 * A date as "2026-12-15" or "15/12/2026" (day first, as Vietnamese sheets
 * write it), at noon UTC so it is the same calendar day in any office.
 * undefined when empty, NaN when it is not a date.
 */
export function parseDay(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return Number.NaN;
  const ms = Date.UTC(y, m - 1, d, 12);
  const back = new Date(ms);
  return back.getUTCDate() === d && back.getUTCMonth() === m - 1 ? ms : Number.NaN;
}

export type ImportLookups = {
  /** Default pipeline first. */
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  members: { id: string; name: string; email: string }[];
  companies: { id: string; name: string }[];
  contacts: { id: string; email: string | null; name: string }[];
  defaultCurrency: string;
  dealFields: FieldDef[];
};

/** One spreadsheet row, as it would be stored, or what is wrong with it. */
export type PlannedDeal = {
  line: number;
  name: string;
  amount: number | null;
  currency: string;
  pipelineId: string;
  pipeline: string;
  stageId: string | null;
  stage: string | null;
  expectedCloseDate: number | null;
  ownerId: string | null;
  owner: string | null;
  companyId: string | null;
  company: string | null;
  /** The company does not exist yet and will be created with the deal. */
  newCompany: boolean;
  contactId: string | null;
  contact: string | null;
  custom: Record<string, unknown>;
  error?: string;
};

/** What each row would become; `line` counts the header as line 1. */
export function planDealImport(rows: Record<string, string>[], lookups: ImportLookups): PlannedDeal[] {
  const byName = <T extends { name: string }>(list: T[], name: string) => list.find((x) => normText(x.name) === normText(name));
  return rows.map((row, index) => {
    const errors: string[] = [];
    const name = cell(row, "name");
    if (!name) errors.push("name: missing");

    const amount = parseAmount(cell(row, "amount"));
    if (Number.isNaN(amount)) errors.push(`amount: "${cell(row, "amount")}" is not a number`);

    const currency = (cell(row, "currency") || lookups.defaultCurrency).toUpperCase();
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) errors.push(`currency: ${currency} is not supported`);

    const pipelineName = cell(row, "pipeline");
    const pipeline = pipelineName ? byName(lookups.pipelines, pipelineName) : lookups.pipelines[0];
    if (!pipeline) errors.push(`pipeline: no pipeline named "${pipelineName}"`);

    const stageName = cell(row, "stage");
    const stage = stageName && pipeline ? byName(pipeline.stages, stageName) : undefined;
    if (stageName && pipeline && !stage) errors.push(`stage: no stage named "${stageName}" in ${pipeline.name}`);

    const close = parseDay(cell(row, "close"));
    if (Number.isNaN(close)) errors.push(`expected close date: "${cell(row, "close")}" is not a date (use 2026-12-31 or 31/12/2026)`);

    const ownerText = cell(row, "owner");
    const owner = ownerText
      ? lookups.members.find((m) => m.email.toLowerCase() === ownerText.toLowerCase() || normText(m.name) === normText(ownerText))
      : undefined;
    if (ownerText && !owner) errors.push(`owner: no member "${ownerText}"`);

    const companyName = cell(row, "company");
    const company = companyName ? byName(lookups.companies, companyName) : undefined;

    const contactText = cell(row, "contact");
    const contact = contactText ? lookups.contacts.find((c) => c.email?.toLowerCase() === contactText.toLowerCase()) : undefined;
    if (contactText && !contact) errors.push(`contact: no contact with the email "${contactText}"`);

    const custom: Record<string, unknown> = {};
    for (const def of lookups.dealFields) {
      if (BUILTIN.has(normText(def.key))) continue;
      const key = Object.keys(row).find((k) => [normText(def.key), normText(def.label)].includes(normText(k)) && row[k] !== "");
      if (!key) continue;
      const raw = def.type === "multiselect" ? row[key]!.split(/[;|]/).map((s) => s.trim()) : row[key];
      const checked = applyCustomFieldValues([def], { [def.key]: raw });
      if (!checked.ok) errors.push(checked.error);
      else if (def.key in checked.data) custom[def.key] = checked.data[def.key];
    }

    return {
      line: index + 2,
      name,
      amount: amount === undefined || Number.isNaN(amount) ? null : amount,
      currency,
      pipelineId: pipeline?.id ?? "",
      pipeline: pipeline?.name ?? pipelineName,
      stageId: stage?.id ?? null,
      stage: stage?.name ?? (stageName || null),
      expectedCloseDate: close === undefined || Number.isNaN(close) ? null : close,
      ownerId: owner?.id ?? null,
      owner: owner?.name ?? (ownerText || null),
      companyId: company?.id ?? null,
      company: company?.name ?? (companyName || null),
      newCompany: Boolean(companyName && !company),
      contactId: contact?.id ?? null,
      contact: contact?.name ?? (contactText || null),
      custom,
      ...(errors.length ? { error: errors.join("; ") } : {}),
    };
  });
}
