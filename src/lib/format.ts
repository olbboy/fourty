/** Client-safe formatting helpers. */

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return future ? `in ${hr}h` : `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return future ? `in ${d}d` : `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return future ? `in ${mo}mo` : `${mo}mo ago`;
  const y = Math.round(mo / 12);
  return future ? `in ${y}y` : `${y}y ago`;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInputValue(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateInputValue(v: string): number | null {
  if (!v) return null;
  const ts = new Date(`${v}T12:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
