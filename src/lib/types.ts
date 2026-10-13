/** Shared client-side record shapes (JSON over the wire). */

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyId: string | null;
  ownerId: string | null;
  status?: string;
  source: string | null;
  score?: number;
  linkedin: string | null;
  city: string | null;
  country: string | null;
  custom: Record<string, unknown>;
  lastActivityAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  linkedin: string | null;
  city: string | null;
  country: string | null;
  annualRevenue: number | null;
  ownerId: string | null;
  custom: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

/** Read DTO returned by Companies list/detail routes after field redaction. */
export type CompanyRead = Partial<Company>;

export type CompanySort =
  | "updatedAt_desc"
  | "updatedAt_asc"
  | "name_asc"
  | "name_desc"
  | "annualRevenue_desc"
  | "annualRevenue_asc";

export type CompanyListQuery = {
  q: string;
  industry: string;
  sort: CompanySort | null;
  offset: number;
  limit: number;
};

export type CompanyExportScope = "selected" | "filtered" | "all";

export type CompanyPage = {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export type CompanyFacets = {
  industries: string[];
};

export type CompaniesListResponse = {
  companies: CompanyRead[];
  page?: CompanyPage;
  facets?: CompanyFacets;
};

export type Stage = {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  winProbability: number;
  type: string;
  color: string;
};

export type Pipeline = {
  id: string;
  name: string;
  isDefault: number;
  stages: Stage[];
};

export type Deal = {
  id: string;
  name: string;
  amount?: number;
  currency?: string;
  pipelineId: string;
  stageId: string;
  companyId: string | null;
  contactId: string | null;
  ownerId: string | null;
  expectedCloseDate: number | null;
  closedAt: number | null;
  stageEnteredAt: number;
  score?: number;
  custom: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: number | null;
  completedAt: number | null;
  priority: string;
  ownerId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: number;
};

export type Note = {
  id: string;
  body: string;
  entityType: string;
  entityId: string;
  authorId: string | null;
  createdAt: number;
  /** Set once the author or an admin corrected it. */
  editedAt?: number | null;
  /** Whether the reader may edit or delete it (author or admin). */
  canChange?: boolean;
};

export type Activity = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  meta: Record<string, unknown>;
  createdAt: number;
};

export type CustomFieldDef = {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: number;
  order: number;
};

/** A no-code object type (Settings → Custom objects). */
export type CustomObjectDef = {
  id: string;
  apiName: string;
  nameSingular: string;
  namePlural: string;
  icon: string;
  description: string | null;
  createdAt: number;
};

export type CustomObjectFieldDef = {
  id: string;
  objectId: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: number;
  order: number;
};

export type CustomRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  data: Record<string, unknown>;
};
