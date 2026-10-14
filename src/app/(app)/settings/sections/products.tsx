"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useConfirm } from "@/components/ui";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/currency";
import { useLocale, useT } from "@/lib/i18n/provider";

type Product = { id: string; name: string; code: string | null; unitPrice: number; currency: string; active: boolean };

/**
 * The product catalogue (D5, CONTEXT.md: Product). Members keep it; a deal's
 * line takes a product's name and price when added and keeps them, so editing
 * or removing a product here never changes a deal.
 */
export function ProductsSection({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/products${canEdit ? "?state=all" : ""}`).catch(() => null);
    if (res?.ok) setProducts(((await res.json()) as { products: Product[] }).products);
  }, [canEdit]);
  useEffect(() => {
    void load();
  }, [load]);

  async function send(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);
    if (!res?.ok) {
      setError(t("products.failed"));
      return false;
    }
    await load();
    return true;
  }

  async function remove(p: Product) {
    const ok = await askConfirm({ title: t("products.deleteTitle", { name: p.name }), body: t("products.deleteBody") });
    if (ok) await send(`/api/products/${p.id}`, "DELETE");
  }

  if (!products) return null;
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("products.title")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("products.hint")}</p>
      {products.length === 0 ? (
        <p className="mb-3 text-sm text-ink-muted">{t("products.empty")}</p>
      ) : (
        <ul className="mb-3 divide-y divide-line/60">
          {products.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="py-2.5">
                <ProductForm
                  initial={p}
                  submitLabel={t("action.save")}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (values) => {
                    if (await send(`/api/products/${p.id}`, "PATCH", values)) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${p.active ? "" : "text-ink-muted line-through"}`}>
                    {p.name}
                    {p.code && <span className="ml-1.5 text-xs font-normal text-ink-muted">{p.code}</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatMoney(p.unitPrice, p.currency, locale)}
                    {!p.active && ` · ${t("products.inactive")}`}
                  </p>
                </div>
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" aria-label={t("products.editAria", { name: p.name })} onClick={() => setEditing(p.id)}>
                      {t("action.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t(p.active ? "products.retireAria" : "products.reviveAria", { name: p.name })}
                      onClick={() => void send(`/api/products/${p.id}`, "PATCH", { active: !p.active })}
                    >
                      {t(p.active ? "products.retire" : "products.revive")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-feedback-error"
                      aria-label={t("products.deleteAria", { name: p.name })}
                      onClick={() => void remove(p)}
                    >
                      {t("action.delete")}
                    </Button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      {canEdit && editing === null && (
        <ProductForm submitLabel={t("products.add")} onSubmit={async (values) => void (await send("/api/products", "POST", values))} reset />
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-feedback-error">
          {error}
        </p>
      )}
      {confirmDialog}
    </Card>
  );
}

type Values = { name: string; code: string | null; unitPrice: number; currency: string };

function ProductForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  reset,
}: {
  initial?: Product;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<void>;
  onCancel?: () => void;
  reset?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [price, setPrice] = useState(initial ? String(initial.unitPrice) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "VND");
  const [busy, setBusy] = useState(false);
  const ready = name.trim() !== "" && price !== "" && Number(price) >= 0;

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        await onSubmit({ name: name.trim(), code: code.trim() || null, unitPrice: Number(price), currency });
        setBusy(false);
        if (reset) {
          setName("");
          setCode("");
          setPrice("");
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("products.name")} placeholder={t("products.name")} maxLength={200} className="h-8 min-w-0 flex-1" />
      <Input value={code} onChange={(e) => setCode(e.target.value)} aria-label={t("products.code")} placeholder={t("products.code")} maxLength={60} className="h-8 w-28" />
      <Input
        type="number"
        min={0}
        step="any"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label={t("products.price")}
        placeholder={t("products.price")}
        className="h-8 w-36"
      />
      <NativeSelect value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={t("field.currency")} size="sm" className="w-24">
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" size="sm" disabled={!ready || busy}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("action.cancel")}
        </Button>
      )}
    </form>
  );
}
