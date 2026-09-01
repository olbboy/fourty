import { describe, expect, it } from "vitest";
import {
  emailsMatch,
  nameAndCompanyMatch,
  namesMatch,
  normalizeEmail,
  normalizePersonName,
  pickDuplicateContacts,
  unackedNameCompanyDuplicate,
} from "@/lib/duplicates";

describe("email identity", () => {
  it("treats case and surrounding space as the same address", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(emailsMatch("Ada@Example.COM", "ada@example.com")).toBe(true);
  });

  it("does not match missing emails", () => {
    expect(emailsMatch(null, "a@b.c")).toBe(false);
    expect(emailsMatch("", "")).toBe(false);
  });
});

describe("name + company identity", () => {
  it("folds case and inner space", () => {
    expect(normalizePersonName("  Ada   Lovelace ")).toBe("ada lovelace");
    expect(namesMatch({ firstName: "Ada", lastName: "Lovelace" }, { firstName: "ada", lastName: "  LOVELACE" })).toBe(
      true,
    );
  });

  it("requires both first and last name", () => {
    expect(namesMatch({ firstName: "Ada", lastName: "" }, { firstName: "Ada", lastName: "" })).toBe(false);
    expect(namesMatch({ firstName: "Ada", lastName: "Lovelace" }, { firstName: "Ada", lastName: "Hopper" })).toBe(
      false,
    );
  });

  it("only matches when the company is the same", () => {
    const ada = { firstName: "Ada", lastName: "Lovelace", companyId: "co_1" };
    expect(nameAndCompanyMatch(ada, { ...ada, companyId: "co_1" })).toBe(true);
    expect(nameAndCompanyMatch(ada, { ...ada, companyId: "co_2" })).toBe(false);
    expect(nameAndCompanyMatch(ada, { ...ada, companyId: null })).toBe(false);
    expect(nameAndCompanyMatch({ ...ada, companyId: null }, { ...ada, companyId: null })).toBe(false);
  });

  it("picks email hits and name+company hits, without listing self", () => {
    const self = { id: "1", firstName: "Ada", lastName: "Lovelace", email: "ada@ex.com", companyId: "co_1" };
    const hits = pickDuplicateContacts(self, [
      self,
      { id: "2", firstName: "Ada", lastName: "Lovelace", email: "other@ex.com", companyId: "co_1" },
      { id: "3", firstName: "Grace", lastName: "Hopper", email: "ADA@ex.com", companyId: "co_9" },
      { id: "4", firstName: "Ada", lastName: "Lovelace", email: "x@y.z", companyId: "co_2" },
    ]);
    expect(hits.map((h) => h.contact.id).sort()).toEqual(["2", "3"]);
    expect(hits.find((h) => h.contact.id === "2")).toMatchObject({ byEmail: false, byNameCompany: true });
    expect(hits.find((h) => h.contact.id === "3")).toMatchObject({ byEmail: true, byNameCompany: false });
  });

  it("does not re-warn a name+company hit the caller already acknowledged", () => {
    const self = { id: "new", firstName: "Ada", lastName: "Lovelace", email: null, companyId: "co_1" };
    const other = { id: "2", firstName: "Ada", lastName: "Lovelace", email: null, companyId: "co_1" };
    expect(unackedNameCompanyDuplicate(self, [other], null)?.contact.id).toBe("2");
    expect(unackedNameCompanyDuplicate(self, [other], "2")).toBeNull();
  });
});
