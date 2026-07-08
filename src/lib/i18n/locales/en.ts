// English catalog (source of truth for the key set — every other locale must
// define exactly these keys; enforced by tests/i18n.test.ts).
export const en = {
  "nav.dashboard": "Dashboard",
  "nav.contacts": "Contacts",
  "nav.companies": "Companies",
  "nav.deals": "Deals",
  "nav.tasks": "Tasks",
  "nav.reports": "Reports",
  "nav.workflows": "Workflows",
  "nav.settings": "Settings",

  "action.new": "New",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.export": "Export",
  "action.import": "Import",
  "action.search": "Search",
  "action.logout": "Log out",

  "common.loading": "Loading…",
  "common.noResults": "No results",
  "common.all": "All",
  "common.saveView": "Save view",

  "settings.language": "Language",
  "settings.languageHint": "Choose the interface language.",

  "greeting.welcome": "Welcome, {name}",
} as const;

export type MessageKey = keyof typeof en;
