// Export surface for the design-system bundle.
//
// This repo is an application, not a library: there is no build that emits a
// dist/ and no barrel of its own, so the converter needs one entry that names
// exactly what the design system publishes. Generated once and committed --
// regenerate by hand when a component is added to src/components/ui/.
//
// Scope rules encoded here:
//   * src/components/ui/* is the primitive layer and ships whole.
//   * App-level components ship only where they add a distinct pattern the
//     primitives do not cover, and only the names that do not collide with a
//     primitive (ui.tsx redeclares Avatar, Field and Spinner; the primitive
//     layer owns those names).
//   * shell, app-sidebar, command-palette and agent-panel are deliberately
//     absent -- they import next/navigation and next/link, which cannot bundle
//     for a browser preview.

export * from "../src/components/ui/avatar";
export * from "../src/components/ui/badge";
export * from "../src/components/ui/breadcrumb";
export * from "../src/components/ui/button-group";
export * from "../src/components/ui/button";
export * from "../src/components/ui/card";
export * from "../src/components/ui/chart";
export * from "../src/components/ui/checkbox";
export * from "../src/components/ui/collapsible";
export * from "../src/components/ui/command";
export * from "../src/components/ui/dialog";
export * from "../src/components/ui/dropdown-menu";
export * from "../src/components/ui/empty";
export * from "../src/components/ui/field";
export * from "../src/components/ui/input-group";
export * from "../src/components/ui/input";
export * from "../src/components/ui/item";
export * from "../src/components/ui/kbd";
export * from "../src/components/ui/label";
export * from "../src/components/ui/native-select";
export * from "../src/components/ui/popover";
export * from "../src/components/ui/scroll-area";
export * from "../src/components/ui/select";
export * from "../src/components/ui/separator";
export * from "../src/components/ui/sheet";
export * from "../src/components/ui/sidebar";
export * from "../src/components/ui/skeleton";
export * from "../src/components/ui/spinner";
export * from "../src/components/ui/switch";
export * from "../src/components/ui/table";
export * from "../src/components/ui/tabs";
export * from "../src/components/ui/textarea";
export * from "../src/components/ui/tooltip";

// App-level patterns the primitive layer does not cover.
export { PageHeader, Modal, StatusChip, ScoreBadge, PriorityChip, EmptyState } from "../src/components/ui";
export { MoneyBarChart, CountBarChart, FunnelChart, WinLossChart, CategoryBars } from "../src/components/charts";
export { FactSuggestion, AppliedFact, FactsForField } from "../src/components/fact-suggestion";
export { ThemeProvider } from "../src/components/theme-provider";
// The brand lockups. A design agent building a screen needs the logo, and
// there is no lettered substitute for it.
export { Logo } from "../src/components/logo";
