"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { PortalShell } from "./portal-shell";
import { usePortalData } from "./use-portal-data";

type Props = {
  businessId?: string;
};

type MenuItem = {
  name: string;
  category: string;
  description: string;
  price: string;
  available: boolean;
};

type MenuResponse = {
  message: string;
};

const defaultMenuItems: MenuItem[] = [
  { name: "Tomato Soup", category: "Soups", description: "House-made tomato soup served warm.", price: "$8", available: true },
  { name: "Caesar Salad", category: "Salads", description: "Crisp romaine with Caesar dressing and croutons.", price: "$10", available: true },
  { name: "Chicken Alfredo", category: "Pasta", description: "Creamy white pasta with grilled chicken.", price: "$18", available: true },
];

function normalizeMenuItems(value: unknown): MenuItem[] {
  if (!Array.isArray(value)) {
    return defaultMenuItems;
  }

  const items = value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      category: String(item.category ?? "").trim(),
      description: String(item.description ?? "").trim(),
      price: String(item.price ?? "").trim(),
      available: Boolean(item.available ?? true),
    }))
    .filter((item) => item.name.length > 0 && item.category.length > 0);

  return items.length > 0 ? items : defaultMenuItems;
}

export function PortalMenuPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<MenuItem[]>([]);

  const initialItems = useMemo(() => normalizeMenuItems(portal.business?.menuItems), [portal.business?.menuItems]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading menu workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  const business = portal.business;

  function updateItem(index: number, field: keyof MenuItem, value: string | boolean) {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { name: "", category: "Mains", description: "", price: "", available: true },
    ]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    const payload = {
      items: items
        .map((item) => ({
          name: item.name.trim(),
          category: item.category.trim(),
          description: item.description.trim(),
          price: item.price.trim(),
          available: item.available,
        }))
        .filter((item) => item.name.length > 0 && item.category.length > 0),
    };

    try {
      const response = await apiRequest<MenuResponse>(`/api/businesses/${business.id}/menu`, {
        method: "PATCH",
        body: payload,
      });
      await portal.refreshBusiness();
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save the menu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell
      active="menu"
      portal={portal}
      subtitle="Add exact menu items so the AI can answer from structured food data instead of broad summaries."
      title="Menu Management"
    >
      {!portal.canEditConfiguration ? (
        <div className="status-banner neutral">Your role does not have access to menu management.</div>
      ) : (
        <section className="menu-layout">
          <form className="surface-card stack-md menu-editor-card" onSubmit={onSubmit}>
            <div className="page-intro">
              <span className="eyebrow">Structured menu</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Exact items the AI can reference</h2>
              <p className="lead" style={{ marginTop: 10 }}>
                Add specific soups, salads, pasta dishes, desserts, bakery items, or drinks. The AI should use these exact entries during calls.
              </p>
            </div>

            <div className="detail-block menu-upload-card">
              <h3>Menu upload</h3>
              <p>
                PDF and image upload with automatic extraction is the next step. For now, structured items below already improve call accuracy.
              </p>
            </div>

            <div className="menu-editor-list">
              {items.map((item, index) => (
                <div className="surface-card muted menu-item-editor" key={`${item.name}-${index}`}>
                  <div className="form-grid two-col menu-item-grid">
                    <div className="field">
                      <label htmlFor={`menu-name-${index}`}>Item name</label>
                      <input
                        id={`menu-name-${index}`}
                        onChange={(event) => updateItem(index, "name", event.target.value)}
                        type="text"
                        value={item.name}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`menu-category-${index}`}>Category</label>
                      <input
                        id={`menu-category-${index}`}
                        onChange={(event) => updateItem(index, "category", event.target.value)}
                        type="text"
                        value={item.category}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`menu-price-${index}`}>Price</label>
                      <input
                        id={`menu-price-${index}`}
                        onChange={(event) => updateItem(index, "price", event.target.value)}
                        type="text"
                        value={item.price}
                      />
                    </div>
                    <div className="field-toggle compact">
                      <div>
                        <strong>Available today</strong>
                        <p>Let the AI mention this item as currently available.</p>
                      </div>
                      <label className="switch">
                        <input
                          checked={item.available}
                          onChange={(event) => updateItem(index, "available", event.target.checked)}
                          type="checkbox"
                        />
                        <span className="switch-slider" />
                      </label>
                    </div>
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor={`menu-description-${index}`}>Description</label>
                      <textarea
                        id={`menu-description-${index}`}
                        onChange={(event) => updateItem(index, "description", event.target.value)}
                        value={item.description}
                      />
                    </div>
                  </div>

                  <div className="button-row" style={{ marginTop: 12 }}>
                    <button className="button-secondary" onClick={() => removeItem(index)} type="button">
                      Remove item
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="button-row">
              <button className="button-secondary" onClick={addItem} type="button">
                Add menu item
              </button>
            </div>

            {success ? <div className="status-banner success">{success}</div> : null}
            {error ? <div className="status-banner error">{error}</div> : null}

            <div className="button-row">
              <button className="button" disabled={saving} type="submit">
                {saving ? "Saving menu..." : "Save menu"}
              </button>
            </div>
          </form>

          <div className="surface-card stack-md menu-snapshot-card">
            <div className="page-intro">
              <span className="eyebrow">Current menu snapshot</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>What the AI should quote exactly</h2>
            </div>

            <div className="detail-block">
              <h3>Why this matters</h3>
              <p>
                Structured menu items let the AI answer exact questions more safely, like available soups, salads, pasta dishes, desserts, and pricing.
              </p>
            </div>

            <div className="menu-snapshot-list">
              {normalizeMenuItems(business.menuItems).map((item, index) => (
                <div className="detail-block menu-snapshot-item" key={`${item.name}-${index}`}>
                  <h3>{item.name}</h3>
                  <p>{item.category}{item.price ? ` | ${item.price}` : ""}{item.available ? "" : " | unavailable"}</p>
                  <p>{item.description || "No description added yet."}</p>
                </div>
              ))}
            </div>

            <div className="detail-block">
              <h3>Next upgrade</h3>
              <p>
                After manual items are working well, we can add CSV, PDF, or image-based menu upload for restaurants and bakeries.
              </p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
