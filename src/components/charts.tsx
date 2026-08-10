"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompact } from "@/lib/currency";

/**
 * Chart colours, resolved from the palette in globals.css.
 *
 * Recharts writes `fill`/`stroke` as SVG presentation attributes, where `var()`
 * does not resolve — so the tokens are read off the document and handed over as
 * concrete colour strings. Reading them (rather than repeating the hexes here)
 * is what keeps the palette single-source: change a token and the charts follow.
 *
 * Categorical series use the neutral value ladder so a chart never competes
 * with the one accent on the page; won/lost get the named semantic series,
 * because that is a distinction the data itself makes.
 */
const CHART_TOKENS = {
  series: "--chart-2",
  won: "--chart-positive",
  lost: "--chart-negative",
  grid: "--border",
  text: "--text-muted",
} as const;

type ChartColors = Record<keyof typeof CHART_TOKENS, string>;

function readChartColors(): ChartColors {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(CHART_TOKENS).map(([role, token]) => [
      role,
      styles.getPropertyValue(token).trim(),
    ]),
  ) as ChartColors;
}

export function useChartColors(): ChartColors {
  // Server render and first paint have no computed styles to read; empty
  // strings let Recharts fall back to its own defaults for that one frame.
  const [colors, setColors] = useState<ChartColors>(() => ({
    series: "",
    won: "",
    lost: "",
    grid: "",
    text: "",
  }));

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setColors(readChartColors());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return colors;
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text)",
};

export function MoneyBarChart({
  data,
  xKey,
  yKey,
  height = 220,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  height?: number;
}) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: colors.text }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: colors.text }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => formatCompact(v, "USD")}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [formatCompact(Number(v), "USD"), "Won"]}
          cursor={{ fill: colors.grid, opacity: 0.35 }}
        />
        <Bar dataKey={yKey} fill={colors.series} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CountBarChart({
  data,
  xKey,
  yKey,
  label,
  height = 220,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  label: string;
  height?: number;
}) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: colors.text }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: colors.text }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [String(v), label]}
          cursor={{ fill: colors.grid, opacity: 0.35 }}
        />
        <Bar dataKey={yKey} fill={colors.series} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal funnel: one measure across ordered stages, direct-labeled. */
export function FunnelChart({
  data,
  height = 240,
}: {
  data: { stage: string; count: number; value: number }[];
  height?: number;
}) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="stage"
          tick={{ fontSize: 12, fill: colors.text }}
          axisLine={false}
          tickLine={false}
          width={86}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, _n, item) => [
            `${item.payload.count} deals · ${formatCompact(item.payload.value, "USD")}`,
            "Open",
          ]}
          cursor={{ fill: colors.grid, opacity: 0.35 }}
        />
        <Bar dataKey="value" fill={colors.series} radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v) => formatCompact(Number(v ?? 0), "USD")}
            style={{ fontSize: 11, fill: colors.text }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Won vs lost counts per month — two validated hues + legend. */
export function WinLossChart({
  data,
  height = 240,
}: {
  data: { month: string; won: number; lost: number }[];
  height?: number;
}) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.text }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: colors.text }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors.grid, opacity: 0.35 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="won" name="Won" fill={colors.won} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="lost" name="Lost" fill={colors.lost} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Simple horizontal count-by-category bars with direct labels. */
export function CategoryBars({
  data,
  nameKey,
  valueKey,
  height = 200,
}: {
  data: Record<string, unknown>[];
  nameKey: string;
  valueKey: string;
  height?: number;
}) {
  const colors = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey={nameKey}
          tick={{ fontSize: 12, fill: colors.text }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: colors.grid, opacity: 0.35 }} />
        <Bar dataKey={valueKey} fill={colors.series} radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList dataKey={valueKey} position="right" style={{ fontSize: 11, fill: colors.text }} />
          {data.map((_, i) => (
            <Cell key={i} fill={colors.series} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
