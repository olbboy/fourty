import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/locales/en";
import { LOCALES, SUPPORTED_LOCALES, t, resolveLocale, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * i18n (Gate C4): every locale must cover exactly the en key set (no missing or
 * extra keys), interpolation works, unknown keys/locales fall back safely, and
 * locale resolution honours cookie → Accept-Language → default in that order.
 */
describe("i18n catalog completeness", () => {
  const enKeys = Object.keys(en).sort();

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} defines exactly the en key set`, () => {
      const keys = Object.keys(LOCALES[locale]).sort();
      expect(keys).toEqual(enKeys);
      // No blank translations.
      for (const k of keys) expect((LOCALES[locale] as Record<string, string>)[k].length).toBeGreaterThan(0);
    });
  }
});

describe("t() translation + interpolation", () => {
  it("translates a known key per locale", () => {
    expect(t("en", "nav.contacts")).toBe("Contacts");
    expect(t("vi", "nav.contacts")).toBe("Liên hệ");
  });

  it("interpolates named vars", () => {
    expect(t("en", "greeting.welcome", { name: "Ada" })).toBe("Welcome, Ada");
    expect(t("vi", "greeting.welcome", { name: "Ada" })).toBe("Chào mừng, Ada");
  });

  it("translates page chrome and record headings", () => {
    expect(t("en", "dash.kpi.pipeline")).toBe("Open pipeline");
    expect(t("vi", "dash.kpi.pipeline")).toBe("Pipeline đang mở");
    expect(t("en", "record.details")).toBe("Details");
    expect(t("en", "record.dealWeighted", { amount: "$10,000", pct: 65 })).toBe(
      "· weighted $10,000 at 65%",
    );
    expect(t("vi", "record.winProbability", { pct: 65 })).toBe("65% xác suất thắng");
    expect(t("vi", "record.details")).toBe("Chi tiết");
    expect(t("en", "record.tabsAria")).toBe("Record detail");
    expect(t("vi", "record.tabsAria")).toBe("Chi tiết bản ghi");
    expect(t("en", "page.contacts.count", { count: 3 })).toBe("3 people");
    expect(t("vi", "page.contacts.count", { count: 3 })).toBe("3 người");
    expect(t("en", "form.createContact")).toBe("Create contact");
    expect(t("vi", "form.createContact")).toBe("Tạo liên hệ");
    expect(t("en", "field.firstName")).toBe("First name");
    expect(t("en", "field.score")).toBe("Score");
    expect(t("vi", "field.score")).toBe("Điểm");
    expect(t("vi", "field.firstName")).toBe("Tên");
    expect(t("en", "field.domainPlaceholder")).toBe("acme.com");
    expect(t("vi", "field.domainPlaceholder")).toBe("congty.com");
    expect(t("en", "field.websitePlaceholder")).toBe("https://…");
    expect(t("en", "wf.create")).toBe("Create workflow");
    expect(t("vi", "wf.create")).toBe("Tạo workflow");
    expect(t("en", "wf.run.createdTask", { title: "Call Ada" })).toBe("Created task “Call Ada”");
    expect(t("vi", "wf.run.addedNote")).toBe("Đã thêm ghi chú");
    expect(t("en", "event.deal.won")).toBe("Deal won");
    expect(t("vi", "event.deal.won")).toBe("Cơ hội thắng");
    expect(t("en", "wf.conditionField", { n: 2 })).toBe("Condition 2 field");
    expect(t("en", "activity.created")).toBe("created this record");
    expect(t("vi", "activity.created")).toBe("đã tạo bản ghi này");
    expect(t("en", "activity.workflowAddedNote")).toBe("Workflow added a note");
    expect(t("vi", "activity.workflowAddedNote")).toBe("Workflow đã thêm ghi chú");
    expect(t("en", "settings.sso")).toBe("Single sign-on");
    expect(t("vi", "settings.sso")).toBe("Đăng nhập SSO");
    expect(t("en", "settings.twofa")).toBe("Two-factor authentication");
    expect(t("en", "agent.askAria")).toBe("Ask about this record");
    expect(t("vi", "agent.askAria")).toBe("Hỏi về bản ghi này");
    expect(t("en", "chat.title")).toBe("Assistant");
    expect(t("vi", "chat.open")).toBe("Mở trợ lý");
    expect(t("en", "chat.placeholder")).toMatch(/CRM/);
    expect(t("en", "agent.offlineHint")).toMatch(/No AI provider is configured/);
    expect(t("en", "settings.twofaTurnOn")).toBe("Turn on two-factor…");
    expect(t("en", "settings.twofaInvalidCode")).toBe("Invalid code");
    expect(t("vi", "settings.twofaInvalidCode")).toBe("Mã không hợp lệ");
    expect(t("en", "settings.twofaFailedSetup")).toBe("Could not start setup");
    expect(t("en", "settings.twofaIncorrectPassword")).toBe("Incorrect password");
    expect(t("en", "settings.invite")).toBe("Invite");
    expect(t("en", "settings.inviteNoSmtp", { email: "a@b.c" })).toMatch(/Email isn't configured/);
    expect(t("en", "login.twoFactorCode")).toBe("Two-factor code");
    expect(t("en", "login.signIn")).toBe("Sign in");
    expect(t("vi", "login.signIn")).toBe("Đăng nhập");
    expect(t("en", "login.namePlaceholder")).toBe("Ada Lovelace");
    expect(t("vi", "login.namePlaceholder")).toBe("Nguyễn Văn An");
    expect(t("en", "login.emailPlaceholder")).toBe("you@company.com");
    expect(t("vi", "login.emailPlaceholder")).toBe("ban@congty.com");
    expect(t("en", "login.invalidCredentials")).toBe("Invalid email or password");
    expect(t("en", "login.twoFactorInvalid")).toBe("Invalid two-factor code");
    expect(t("vi", "login.twoFactorInvalid")).toBe("Mã hai yếu tố không hợp lệ");
    expect(t("en", "login.tooManyAttempts")).toMatch(/Too many login attempts/);
    expect(t("en", "auth.resetNoMail")).toMatch(/isn't set up on this instance/);
    expect(t("en", "auth.missingToken")).toMatch(/missing its token/);
    expect(t("en", "auth.setPassword")).toBe("Set new password");
    expect(t("en", "auth.resetLinkInvalid")).toMatch(/invalid or has expired/);
    expect(t("vi", "auth.resetLinkInvalid")).toMatch(/hết hạn/);
    expect(t("en", "accept.invited")).toBe("You've been invited to a workspace");
    expect(t("en", "accept.expired")).toMatch(/invalid or has expired/);
    expect(t("vi", "accept.expired")).toMatch(/hết hạn/);
    expect(t("en", "accept.createAndJoin")).toBe("Create account and join");
    expect(t("en", "accept.choosePassword")).toBe("Choose a password");
    expect(t("en", "settings.ssoModalAdd")).toBe("Add an OIDC provider");
    expect(t("vi", "settings.ssoModalAdd")).toBe("Thêm nhà cung cấp OIDC");
    expect(t("en", "settings.ssoName")).toBe("Name (shown on the sign-in button)");
    expect(t("en", "settings.ssoNamePlaceholder")).toBe("Okta");
    expect(t("vi", "settings.ssoIssuerPlaceholder")).toBe("https://example.okta.com");
    expect(t("en", "settings.ssoSave")).toBe("Save provider");
    expect(t("en", "settings.ssoFailedSave")).toBe("Failed to save provider");
    expect(t("vi", "settings.ssoNotFound")).toBe("Không tìm thấy nhà cung cấp");
    expect(t("en", "settings.mailboxModal")).toBe("Add a mailbox or calendar");
    expect(t("en", "settings.mailboxFeedUrl")).toBe("Calendar feed URL");
    expect(t("en", "settings.mailboxConnect")).toBe("Connect");
    expect(t("en", "settings.mailboxFailedAdd")).toBe("Failed to add mailbox");
    expect(t("en", "settings.mailboxNoSecretKey")).toMatch(/FOURTY_SECRET_KEY/);
    expect(t("vi", "settings.mailboxNotFound")).toBe("Không tìm thấy hộp thư");
    expect(t("en", "settings.mailboxNeverSynced")).toBe("never synced");
    expect(t("en", "settings.mailboxErrFeedHttp", { status: 500 })).toBe("calendar feed returned HTTP 500");
    expect(t("vi", "settings.mailboxErrFeedHttp", { status: 500 })).toBe("feed lịch trả HTTP 500");
    expect(t("en", "settings.newContactField")).toBe("New contact field");
    expect(t("en", "settings.fieldLabel")).toBe("Label");
    expect(t("en", "settings.mailboxLabelPlaceholder")).toBe("Sales inbox");
    expect(t("en", "settings.mailboxImapHostPlaceholder")).toBe("imap.company.com");
    expect(t("vi", "settings.mailboxImapHostPlaceholder")).toBe("imap.congty.com");
    expect(t("vi", "settings.inviteEmailPlaceholder")).toBe("dongnghiep@congty.com");
    expect(t("vi", "settings.objectDescriptionPlaceholder")).toBe("Đối tượng này dùng để làm gì");
    expect(t("vi", "settings.fieldLabelPlaceholder")).toMatch(/Hạng hợp đồng/);
    expect(t("en", "settings.fieldKeyPlaceholder")).toBe("contract_tier");
    expect(t("vi", "settings.fieldKeyPlaceholder")).toBe("hang_hop_dong");
    expect(t("en", "settings.objectApiNamePlaceholder")).toBe("project");
    expect(t("vi", "settings.objectApiNamePlaceholder")).toBe("du_an");
    expect(t("vi", "settings.objectFieldKeyPlaceholder")).toBe("tieu_de");
    expect(t("en", "settings.createField")).toBe("Create field");
    expect(t("en", "settings.fieldTypeText")).toBe("Text");
    expect(t("vi", "settings.fieldTypeNumber")).toBe("Số");
    expect(t("en", "settings.newObjectModal")).toBe("New custom object");
    expect(t("en", "settings.objectSingular")).toBe("Singular name");
    expect(t("en", "settings.createObject")).toBe("Create object");
    expect(t("en", "settings.addField")).toBe("Add field");
    expect(t("en", "settings.newObjectField", { name: "Ticket" })).toBe("New Ticket field");
    expect(t("en", "settings.requiredSuffix")).toBe(" · required");
    expect(t("vi", "settings.createField")).toBe("Tạo trường");
    expect(t("en", "settings.objectApiExists")).toBe("An object with this api name already exists");
    expect(t("en", "settings.fieldKeyExists")).toBe("A field with this key already exists");
    expect(t("vi", "settings.objectApiReserved")).toMatch(/Tên API/);
    expect(t("en", "settings.fieldPermsModal")).toBe("Add a field permission");
    expect(t("en", "settings.fieldPermsAllow")).toBe("Allow");
    expect(t("en", "settings.fieldPermsAllowAria", { role: "viewer", object: "contacts", field: "linkedin" })).toBe(
      "Allow viewers to access contacts.linkedin",
    );
    expect(t("en", "settings.fieldPermsHidden")).toBe("Hidden");
    expect(t("en", "settings.apiKeysGenerate")).toBe("Generate");
    expect(t("en", "settings.apiKeysNamePlaceholder")).toBe("Key name, e.g. Zapier");
    expect(t("en", "settings.apiKeysRevoke")).toBe("Revoke");
    expect(t("en", "settings.webhooksRotateTitle")).toBe("Rotate the webhook signing secret?");
    expect(t("en", "settings.webhooksRotate")).toBe("Rotate");
    expect(t("en", "settings.webhooksFailedLoad")).toBe("Failed to load signing secret");
    expect(t("vi", "settings.webhooksFailedRotate")).toBe("Không xoay được secret");
    expect(t("vi", "settings.fieldPermsModal")).toBe("Thêm quyền theo trường");
    expect(t("vi", "settings.roleViewer")).toBe("Người xem");
    expect(t("en", "settings.roleAdmin")).toBe("Admin");
    expect(t("vi", "settings.roleAdmin")).toBe("Quản trị viên");
    expect(t("vi", "settings.fieldPermsAllowAria", { role: "Người xem", object: "contacts", field: "linkedin" })).toBe(
      "Cho Người xem truy cập contacts.linkedin",
    );
    expect(t("en", "settings.fieldPermsForbidden")).toMatch(/permission/);
    expect(t("en", "settings.auditSystem")).toBe("System");
    expect(t("vi", "settings.auditVia", { via: "mcp" })).toBe("qua mcp");
    expect(t("vi", "settings.auditLatest")).toMatch(/200/);
    expect(t("en", "audit.verb.created", { object: "Contact" })).toBe("Contact created");
    expect(t("vi", "audit.action.api_key.revoked")).toBe("Đã thu hồi khóa API");
    expect(t("en", "settings.cap.mailbox.label")).toBe("Mailbox sync");
    expect(t("en", "settings.cap.objects.label")).toBe("Custom objects");
    expect(t("en", "settings.diagnosticsAboutLabel", { name: "Acme" })).toBe("What Acme does");
    expect(t("en", "action.save")).toBe("Save");
    expect(t("en", "action.close")).toBe("Close");
    expect(t("vi", "action.close")).toBe("Đóng");
    expect(t("en", "nav.breadcrumb")).toBe("Breadcrumb");
    expect(t("vi", "nav.breadcrumb")).toBe("Đường dẫn");
    expect(t("en", "common.more")).toBe("More");
    expect(t("vi", "common.more")).toBe("Thêm");
    expect(t("vi", "settings.diagnosticsResearchTitle")).toBe("Đọc hộp thư đã kết nối để lấy fact");
    expect(t("en", "page.settings.restApi")).toBe("REST API");
    expect(t("vi", "page.settings.restApiReadme")).toMatch(/README/);
    expect(t("en", "health.healthy")).toBe("healthy");
    expect(t("vi", "health.stalled")).toBe("đình trệ");
    expect(t("vi", "score.hot")).toBe("nóng");
    expect(t("en", "page.import.title")).toBe("Import contacts");
    expect(t("en", "page.import.drop")).toBe("Drop a CSV here or click to browse");
    expect(t("en", "page.import.empty")).toBe("The file is empty");
    expect(t("vi", "page.import.tooMany", { max: 5000 })).toBe("Quá nhiều dòng (tối đa 5000)");
    expect(t("en", "page.objects.new", { name: "ticket" })).toBe("New ticket");
    expect(t("en", "page.objects.create")).toBe("Create");
    expect(t("en", "page.objects.emptyHintFields")).toMatch(/Settings → Custom objects/);
    expect(t("en", "settings.cap.webhooks.from")).toMatch(/Workflows →/);
    expect(t("en", "settings.cap.webhooks.from")).not.toMatch(/Automations/);
    expect(t("vi", "settings.cap.webhooks.from")).toMatch(/Tự động hóa →/);
    expect(t("en", "settings.customObjects")).toBe("Custom objects");
    expect(t("vi", "page.import.title")).toBe("Nhập liên hệ");
    expect(t("en", "cmd.title")).toBe("Command palette");
    expect(t("en", "cmd.goTo", { name: "Settings" })).toBe("Go to Settings");
    expect(t("en", "shell.signOut")).toBe("Sign out");
    expect(t("en", "shell.accountMenu")).toBe("Account menu");
    expect(t("en", "shell.toggleTheme")).toBe("Toggle theme");
    expect(t("en", "shell.toggleSidebar")).toBe("Toggle sidebar");
    expect(t("vi", "shell.toggleSidebar")).toBe("Hiện/ẩn thanh bên");
    expect(t("vi", "common.loading")).toBe("Đang tải…");
    expect(t("vi", "cmd.goTo", { name: "Cài đặt" })).toBe("Đến Cài đặt");
    expect(t("en", "page.objects.edit", { name: "ticket" })).toBe("Edit ticket");
    expect(t("en", "page.objects.untitled")).toBe("Untitled");
    expect(t("en", "page.objects.yes")).toBe("Yes");
    expect(t("vi", "page.objects.edit", { name: "ticket" })).toBe("Sửa ticket");
    expect(t("en", "time.justNow")).toBe("just now");
    expect(t("en", "time.minutesAgo", { n: 5 })).toBe("5m ago");
    expect(t("vi", "time.justNow")).toBe("vừa xong");
    expect(t("vi", "time.minutesAgo", { n: 5 })).toBe("5 phút trước");
    expect(t("en", "time.daysShort", { n: 12 })).toBe("12d");
    expect(t("vi", "time.daysShort", { n: 12 })).toBe("12 ngày");
    expect(t("en", "record.createdUpdated", { created: "Jan 1, 2026", updated: "5m ago" })).toBe(
      "Created Jan 1, 2026 · Updated 5m ago",
    );
    expect(t("en", "agent.queueTitle")).toBe("Background work");
    expect(t("en", "agent.newConversation")).toBe("New conversation");
    expect(t("vi", "record.updated", { when: "5 phút trước" })).toBe("Cập nhật 5 phút trước");
    expect(t("en", "nba.title")).toBe("Next best action");
    expect(t("en", "nba.contact.addReach")).toBe("Add an email or phone number");
    expect(t("en", "nba.contact.lastTouchDays", { n: 20 })).toBe("Last touch was 20 days ago.");
    expect(t("vi", "nba.title")).toBe("Hành động tốt nhất tiếp theo");
    expect(t("en", "settings.inviteFailed")).toBe("Failed to invite");
    expect(t("en", "settings.inviteLastAdminDemote")).toBe("Cannot demote the last admin");
    expect(t("vi", "settings.inviteFailed")).toBe("Không gửi được lời mời");
    expect(t("en", "settings.apiKeysFailedCreate")).toBe("Failed to generate key");
    expect(t("vi", "settings.apiKeysFailedRevoke")).toBe("Không thu hồi được khóa");
    expect(t("en", "page.workflows.runStatusSuccess")).toBe("Success");
    expect(t("vi", "page.workflows.runStatusError")).toBe("Lỗi");
    expect(t("en", "action.accept")).toBe("Accept");
    expect(t("vi", "action.dismiss")).toBe("Bỏ qua");
    expect(t("en", "fact.acceptAria", { value: "Head of Operations" })).toBe("Accept Head of Operations");
    expect(t("vi", "fact.band.verified")).toBe("Đã xác minh");
    expect(t("en", "fact.dismissAria", { value: "Chief of Staff" })).toBe(
      "Dismiss Chief of Staff permanently",
    );
  });

  it("leaves an unmatched placeholder intact", () => {
    // greeting.welcome expects {name}; passing nothing leaves the token.
    expect(t("en", "greeting.welcome")).toBe("Welcome, {name}");
  });
});

describe("resolveLocale precedence", () => {
  it("prefers a valid cookie", () => {
    expect(resolveLocale({ cookie: "vi", acceptLanguage: "en-US" })).toBe("vi");
  });

  it("falls back to Accept-Language when no cookie", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "vi-VN,vi;q=0.9,en;q=0.8" })).toBe("vi");
  });

  it("ignores an unsupported cookie and header, defaulting", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "fr-FR,de;q=0.9" })).toBe(DEFAULT_LOCALE);
  });

  it("guards isLocale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("klingon")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
