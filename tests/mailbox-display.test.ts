import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { formatMailboxLastError, isSecretKeyError } from "@/lib/mailbox-display";

describe("formatMailboxLastError", () => {
  const en = translator("en");
  const vi = translator("vi");

  it("translates known engine lastError lines", () => {
    expect(formatMailboxLastError("feed responded 500", en)).toBe(
      "Last sync failed: calendar feed returned HTTP 500",
    );
    expect(formatMailboxLastError("feed responded 500", vi)).toBe(
      "Lần đồng bộ trước thất bại: feed lịch trả HTTP 500",
    );
    expect(formatMailboxLastError("sync failed", vi)).toBe("Lần đồng bộ trước thất bại: không kéo được hộp thư");
    expect(formatMailboxLastError("gmail list failed (HTTP 401)", vi)).toBe(
      "Lần đồng bộ trước thất bại: Không liệt kê được Gmail (HTTP 401)",
    );
    expect(formatMailboxLastError("account is not connected (no refresh token)", vi)).toBe(
      "Lần đồng bộ trước thất bại: tài khoản chưa kết nối (không có refresh token)",
    );
    expect(formatMailboxLastError("OAuth client for 'google' is not configured (set the provider env vars)", vi)).toBe(
      "Lần đồng bộ trước thất bại: OAuth chưa cấu hình cho google",
    );
    expect(formatMailboxLastError("token refresh failed (HTTP 400)", en)).toBe(
      "Last sync failed: token refresh failed (HTTP 400)",
    );
    expect(formatMailboxLastError("The operation was aborted.", vi)).toBe(
      "Lần đồng bộ trước thất bại: yêu cầu hết thời gian chờ",
    );
  });

  it("maps secret-key lastError to a catalog fragment", () => {
    expect(
      formatMailboxLastError("FOURTY_SECRET_KEY is not set, so this secret cannot be encrypted.", vi),
    ).toBe("Lần đồng bộ trước thất bại: FOURTY_SECRET_KEY thiếu hoặc không hợp lệ");
  });

  it("leaves unknown lastError unchanged inside the wrapper", () => {
    expect(formatMailboxLastError("ECONNRESET", en)).toBe("Last sync failed: ECONNRESET");
  });
});

describe("isSecretKeyError", () => {
  it("recognises engine secret-key messages", () => {
    expect(isSecretKeyError("FOURTY_SECRET_KEY is not set, so this secret cannot be encrypted.")).toBe(true);
    expect(isSecretKeyError("Refusing to store refreshToken unencrypted.")).toBe(true);
    expect(isSecretKeyError("feed responded 500")).toBe(false);
    expect(isSecretKeyError(undefined)).toBe(false);
  });
});
