"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatMoney } from "@/lib/currency";
import { useLocale, useT } from "@/lib/i18n/provider";

/** As GET /api/deals/:id/lines returns it; prices are absent for a role that cannot read the Amount. */
type Line = { id: string; productId: string | null; name: string; quantity: number; unitPrice?: number; total?: number };
type Product = { id: string; name: string; code: string | null; unitPrice: number; currency: string };
/** What PUT takes back: a line keeps its own name and price, so a later catalogue change never rewrites it. */
type LineInput = { productId: string | null; name: string; quantity: number; unitPrice?: number };

const asInput = (l: Line): LineInput => ({ productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice });

/**
 * A deal's Line items (D5, CONTEXT.md). With any lines, the deal's Amount is
 * their sum, so it is changed here and not in the deal form. Every change
 * saves the whole list, the way the server takes it.
 */
export function DealLinesPanel({
  dealId,
  currency,
  canEdit,
  onChanged,
  onCount,
}: {
  dealId: string;
  currency: string;
  canEdit: boolean;
  onChanged?: () => void;
  onCount?: (n: number) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const show = useCallback(
    (body: { lines: Line[]; total: number | null }) => {
      setLines(body.lines);
      setTotal(body.total);
      onCount?.(body.lines.length);
    },
    [onCount],
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${dealId}/lines`).catch(() => null);
    if (res?.ok) show(await res.json());
  }, [dealId, show]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((b: { products: Product[] }) => setProducts(b.products ?? []))
      .catch(() => setProducts([]));
  }, [canEdit]);

  async function save(next: LineInput[]): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/deals/${dealId}/lines`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines: next }),
    }).catch(() => null);
    if (!res?.ok) {
      const message = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : undefined;
      setError(message ?? t("dealLines.failed"));
      return false;
    }
    show(await res.json());
    onChanged?.();
    return true;
  }

  if (!lines) return null;
  const current = lines.map(asInput);
  const chosen = products.find((p) => p.id === productId);
  const qty = Number(quantity);
  const canAdd = qty > 0 && (chosen !== undefined || (name.trim() !== "" && price !== ""));

  function change(index: number, patch: Partial<LineInput>) {
    const before = current[index]!;
    const after = { ...before, ...patch };
    if (after.quantity === before.quantity && after.unitPrice === before.unitPrice) return;
    if (!(after.quantity > 0) || (after.unitPrice !== undefined && !(after.unitPrice >= 0))) {
      setError(t("dealLines.badNumber"));
      return;
    }
    void save(current.map((l, i) => (i === index ? after : l)));
  }

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("dealLines.none")}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {lines.map((line, i) => (
            <li key={line.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{line.name}</span>
              {canEdit ? (
                <>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={line.quantity}
                    aria-label={t("dealLines.quantityOf", { name: line.name })}
                    className="h-8 w-16"
                    onBlur={(e) => change(i, { quantity: Number(e.currentTarget.value) })}
                  />
                  {line.unitPrice !== undefined && (
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={line.unitPrice}
                      aria-label={t("dealLines.priceOf", { name: line.name })}
                      className="h-8 w-32"
                      onBlur={(e) => change(i, { unitPrice: Number(e.currentTarget.value) })}
                    />
                  )}
                </>
              ) : (
                <span className="text-ink-muted">
                  {line.quantity}
                  {line.unitPrice !== undefined && ` × ${formatMoney(line.unitPrice, currency, locale)}`}
                </span>
              )}
              {line.total !== undefined && (
                <span className="w-32 shrink-0 text-right tabular-nums">{formatMoney(line.total, currency, locale)}</span>
              )}
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("dealLines.removeAria", { name: line.name })}
                  onClick={() => void save(current.filter((_, j) => j !== i))}
                >
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {total !== null && (
        <p className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
          <span>{t("dealLines.total")}</span>
          <span className="tabular-nums">{formatMoney(total, currency, locale)}</span>
        </p>
      )}
      {lines.length > 0 && <p className="text-xs text-ink-muted">{t("dealLines.amountHint")}</p>}
      {canEdit && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAdd) return;
            // A product line left without a name or price takes the catalogue's,
            // the price converted into the deal's currency by the server.
            const line: LineInput = {
              productId: chosen?.id ?? null,
              name: name.trim(),
              quantity: qty,
              ...(price !== "" ? { unitPrice: Number(price) } : {}),
            };
            void save([...current, line]).then((ok) => {
              if (!ok) return;
              setProductId("");
              setName("");
              setQuantity("1");
              setPrice("");
            });
          }}
        >
          {products.length > 0 && (
            <NativeSelect
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              aria-label={t("dealLines.productAria")}
              size="sm"
              className="min-w-0 flex-1"
            >
              <option value="">{t("dealLines.pickProduct")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.name} (${p.code})` : p.name} · {formatMoney(p.unitPrice, p.currency, locale)}
                </option>
              ))}
            </NativeSelect>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("dealLines.nameAria")}
            placeholder={chosen ? chosen.name : t("dealLines.namePlaceholder")}
            maxLength={200}
            className="h-8 min-w-0 flex-1"
          />
          <Input
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-label={t("dealLines.quantityAria")}
            className="h-8 w-16"
          />
          <Input
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={t("dealLines.priceAria", { currency })}
            placeholder={chosen ? t("dealLines.catalogPrice") : t("dealLines.pricePlaceholder", { currency })}
            className="h-8 w-32"
          />
          <Button type="submit" size="sm" disabled={!canAdd} aria-label={t("dealLines.addAria")}>
            {t("dealLines.add")}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
    </div>
  );
}
