import type { MessageKey } from "./en";

// Vietnamese catalog. Must define exactly the keys in en.ts.
export const vi: Record<MessageKey, string> = {
  "nav.dashboard": "Tổng quan",
  "nav.contacts": "Liên hệ",
  "nav.companies": "Công ty",
  "nav.deals": "Cơ hội",
  "nav.tasks": "Công việc",
  "nav.reports": "Báo cáo",
  "nav.workflows": "Tự động hóa",
  "nav.settings": "Cài đặt",

  "action.new": "Thêm mới",
  "action.save": "Lưu",
  "action.cancel": "Hủy",
  "action.delete": "Xóa",
  "action.edit": "Sửa",
  "action.export": "Xuất",
  "action.import": "Nhập",
  "action.search": "Tìm kiếm",
  "action.logout": "Đăng xuất",

  "common.loading": "Đang tải…",
  "common.noResults": "Không có kết quả",
  "common.all": "Tất cả",
  "common.saveView": "Lưu bộ lọc",

  "settings.language": "Ngôn ngữ",
  "settings.languageHint": "Chọn ngôn ngữ giao diện.",

  "greeting.welcome": "Chào mừng, {name}",
};
