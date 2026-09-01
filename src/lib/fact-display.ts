import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const BAND_KEYS: Record<string, MessageKey> = {
  VERIFIED: "fact.band.verified",
  PROBABLE: "fact.band.probable",
  POSSIBLE: "fact.band.possible",
};

const FIELD_KEYS: Record<string, MessageKey> = {
  job_title: "field.jobTitle",
  company_id: "field.company",
  linkedin: "field.linkedin",
};

/** Band is a stable English machine token (API + DB); map it at display time. */
export function factBandLabel(band: string, t: Translate): string {
  const key = BAND_KEYS[band];
  return key ? t(key) : band;
}

/** Fact field is a stable API token; map known columns at display time. */
export function factFieldLabel(field: string, t: Translate): string {
  const key = FIELD_KEYS[field];
  return key ? t(key) : field;
}
