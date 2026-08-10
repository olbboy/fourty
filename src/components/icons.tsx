import {
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  CheckSquare,
  Download,
  Flame,
  Key,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Menu,
  Moon,
  Phone,
  Plus,
  Search,
  Settings,
  SquareKanban,
  SquarePen,
  StickyNote,
  Sun,
  Target,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The product's icon set — one library, named for what each icon means here.
 *
 * These used to be hand-drawn SVGs. They were drawn to Lucide's own spec (24
 * grid, 2px stroke, round caps and joins) because `src/components/ui/*` already
 * ships Lucide, so the two sets were never two stroke voices — they were one
 * voice maintained twice. This file keeps the naming and the call signature the
 * app has always used and gets the geometry from the library.
 *
 * Two things it adds on top of Lucide, which is why call sites import from here
 * rather than from `lucide-react` directly:
 *
 * - **`aria-hidden` by default.** An icon here is decorative; the control around
 *   it carries the name. Lucide renders a bare `<svg>`, which announces as an
 *   unnamed graphic. A caller that genuinely means the icon to be announced
 *   passes its own `aria-label` and `aria-hidden={false}`.
 * - **`width` / `height` as numbers.** Every call site sizes icons that way.
 */
type IconProps = React.SVGProps<SVGSVGElement>;

function icon(Glyph: LucideIcon) {
  return function Icon({ width = 18, height = 18, ...props }: IconProps) {
    return <Glyph width={width} height={height} aria-hidden focusable={false} {...props} />;
  };
}

export const IconDashboard = icon(LayoutDashboard);
export const IconUsers = icon(Users);
export const IconBuilding = icon(Building2);
export const IconTarget = icon(Target);
export const IconCheckSquare = icon(CheckSquare);
export const IconZap = icon(Zap);
export const IconSettings = icon(Settings);
export const IconSearch = icon(Search);
export const IconPlus = icon(Plus);
export const IconMoon = icon(Moon);
export const IconSun = icon(Sun);
export const IconLogout = icon(LogOut);
export const IconX = icon(X);
export const IconTrash = icon(Trash2);
export const IconEdit = icon(SquarePen);
export const IconChart = icon(BarChart3);
export const IconMail = icon(Mail);
export const IconPhone = icon(Phone);
export const IconCalendar = icon(Calendar);
export const IconNote = icon(StickyNote);
export const IconUpload = icon(Upload);
export const IconDownload = icon(Download);
export const IconKey = icon(Key);
export const IconArrowRight = icon(ArrowRight);
export const IconFlame = icon(Flame);
export const IconMenu = icon(Menu);
export const IconKanban = icon(SquareKanban);
export const IconList = icon(List);
