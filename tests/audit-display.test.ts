import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import {
  auditActionLabel,
  auditActorLabel,
  auditObjectLabel,
  formatAuditVia,
} from "@/lib/audit-display";

describe("auditActorLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("labels a null actor as the system", () => {
    expect(auditActorLabel(null, {}, en)).toBe("System");
    expect(auditActorLabel(null, {}, vi)).toBe("Hệ thống");
  });

  it("prefers the member name, else the raw id", () => {
    expect(auditActorLabel("u1", { u1: "Ada" }, en)).toBe("Ada");
    expect(auditActorLabel("u1", {}, en)).toBe("u1");
  });
});

describe("formatAuditVia", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates the via chrome and leaves the token as written", () => {
    expect(formatAuditVia("mcp", en)).toBe("via mcp");
    expect(formatAuditVia("csv-import", vi)).toBe("qua csv-import");
  });
});

describe("auditActionLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("composes created/updated/deleted with a translated object", () => {
    expect(auditActionLabel("contact.created", en)).toBe("Contact created");
    expect(auditActionLabel("api_key.created", en)).toBe("API key created");
    expect(auditActionLabel("deal.updated", vi)).toBe("Đã cập nhật cơ hội");
    expect(auditActionLabel("record.deleted", vi)).toBe("Đã xóa bản ghi");
  });

  it("translates non-CRUD actions as whole phrases", () => {
    expect(auditActionLabel("contacts.imported", en)).toBe("Contacts imported");
    expect(auditActionLabel("sync_account.ran", en)).toBe("Mailbox synced");
    expect(auditActionLabel("member.role_changed", vi)).toBe("Đã đổi vai trò thành viên");
    expect(auditActionLabel("fact.accepted", vi)).toBe("Đã chấp nhận fact");
  });

  it("leaves unknown action tokens unchanged", () => {
    expect(auditActionLabel("widget.frobbed", en)).toBe("widget.frobbed");
    expect(auditActionLabel("mystery", vi)).toBe("mystery");
  });
});

describe("auditObjectLabel", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known object types and leaves custom api names", () => {
    expect(auditObjectLabel("contact", en)).toBe("Contact");
    expect(auditObjectLabel("sync_account", vi)).toBe("hộp thư");
    expect(auditObjectLabel("ticket", en)).toBe("ticket");
  });
});
