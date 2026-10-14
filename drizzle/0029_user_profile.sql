-- 0029 — A person's job title and phone (D19), written by themselves under My
-- account and shown in the member list. users is the identity plane (no RLS).
ALTER TABLE "users" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;
