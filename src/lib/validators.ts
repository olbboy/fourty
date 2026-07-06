import { z } from "zod";

export const contactInput = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().max(120).optional().default(""),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  jobTitle: z.string().max(160).nullable().optional(),
  companyId: z.string().nullable().optional(),
  status: z.enum(["lead", "qualified", "customer", "churned"]).optional().default("lead"),
  source: z.string().max(60).nullable().optional(),
  linkedin: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export const contactPatch = contactInput.partial();

export const companyInput = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(200).nullable().optional(),
  industry: z.string().max(120).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  linkedin: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  annualRevenue: z.number().nullable().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export const companyPatch = companyInput.partial();

export const dealInput = z.object({
  name: z.string().min(1).max(240),
  amount: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("USD"),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  companyId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  expectedCloseDate: z.number().nullable().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export const dealPatch = dealInput.partial();

export const taskInput = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).nullable().optional(),
  dueDate: z.number().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  entityType: z.enum(["contact", "company", "deal"]).nullable().optional(),
  entityId: z.string().nullable().optional(),
});

export const taskPatch = taskInput.partial().extend({
  completed: z.boolean().optional(),
});

export const noteInput = z.object({
  body: z.string().min(1).max(10000),
  entityType: z.enum(["contact", "company", "deal"]),
  entityId: z.string().min(1),
});

export const activityLogInput = z.object({
  type: z.enum(["email", "call", "meeting"]),
  entityType: z.enum(["contact", "company", "deal"]),
  entityId: z.string().min(1),
  note: z.string().max(2000).optional(),
});
