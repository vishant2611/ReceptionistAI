"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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
  availabilityMode: "AVAILABLE" | "DISABLED_TODAY" | "DISABLED_UNTIL";
  disabledUntil: string;
};

type AvailabilityMode = MenuItem["availabilityMode"];

type MenuSource = {
  filename: string;
  mimeType: string;
  importedAt: string;
};

type MenuResponse = {
  message: string;
  business?: {
    id: string;
    menuItems?: MenuItem[];
    menuSource?: MenuSource | null;
  };
};

type MenuImportResponse = {
  message: string;
  items: MenuItem[];
  source: MenuSource;
};

const defaultMenuItems: MenuItem[] = [];

function normalizeMenuItems(value: unknown): MenuItem[] {
  if (!Array.isArray(value)) {
    return defaultMenuItems;
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => {
      const availabilityMode: AvailabilityMode =
        item.availabilityMode === "DISABLED_TODAY" || item.availabilityMode === "DISABLED_UNTIL"
          ? item.availabilityMode
          : "AVAILABLE";

      return {
        name: String(item.name ?? "").trim(),
        category: String(item.category ?? "").trim(),
        description: String(item.description ?? "").trim(),
        price: String(item.price ?? "").trim(),
        available: item.available !== false,
        availabilityMode,
        disabledUntil: String(item.disabledUntil ?? "").trim(),
      };
    })
    .filter((item) => item.name.length > 0 && item.category.length > 0);
}

function formatImportedAt(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function toBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function PortalMenuPage({ businessId = "" }: Props) {
  const portal = usePortalData(businessId);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [source, setSource] = useState<MenuSource | null>(null);
  const [selectedFilename, setSelectedFilename] = useState("");

  const initialItems = useMemo(() => normalizeMenuItems(portal.business?.menuItems), [portal.business?.menuItems]);

  useEffect(() => {
    setItems(initialItems);
    setSource(
      portal.business?.menuSource
        ? {
            filename: portal.business.menuSource.filename || "",
            mimeType: portal.business.menuSource.mimeType || "",
            importedAt: portal.business.menuSource.importedAt || "",
          }
        : null,
    );
  }, [initialItems, portal.business?.menuSource]);

  if (portal.loading) return <main className="app-shell"><section className="container"><div className="status-banner neutral">Loading menu workspace...</div></section></main>;
  if (portal.error) return <main className="app-shell"><section className="container"><div className="status-banner error">{portal.error}</div></section></main>;
  if (!portal.business) return <main className="app-shell"><section className="container"><div className="status-banner neutral">No business data found yet.</div></section></main>;

  const business = portal.business;

  function updateItem(index: number, field: keyof MenuItem, value: string | boolean) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const nextItem = { ...item, [field]: value };

        if (field === "availabilityMode" && value === "AVAILABLE") {
          nextItem.available = true;
          nextItem.disabledUntil = "";
        }

        if (field === "availabilityMode" && value === "DISABLED_TODAY") {
          nextItem.available = false;
          nextItem.disabledUntil = "";
        }

        if (field === "availabilityMode" && value === "DISABLED_UNTIL") {
          nextItem.available = false;
        }

        if (field === "available" && value === true) {
          nextItem.availabilityMode = "AVAILABLE";
          nextItem.disabledUntil = "";
        }

        if (field === "available" && value === false && nextItem.availabilityMode === "AVAILABLE") {
          nextItem.availabilityMode = "DISABLED_TODAY";
        }

        return nextItem;
      }),
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { name: "", category: "Mains", description: "", price: "", available: true, availabilityMode: "AVAILABLE", disabledUntil: "" },
    ]);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!(file.type.includes("pdf") || file.type.startsWith("image/"))) {
      setError("Please upload a PDF or image file.");
      return;
    }

    setImporting(true);
    setError("");
    setSuccess("");
    setSelectedFilename(file.name);

    try {
      const contentBase64 = await toBase64(file);
      const response = await apiRequest<MenuImportResponse>(`/api/businesses/${business.id}/menu/import`, {
        method: "PATCH",
        body: {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64,
        },
      });

      setItems(response.items);
      setSource(response.source);
      setSuccess(response.message);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import the menu.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
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
          available: item.availabilityMode === "AVAILABLE",
          availabilityMode: item.availabilityMode,
          disabledUntil: item.availabilityMode === "DISABLED_UNTIL" ? item.disabledUntil.trim() : "",
        }))
        .filter((item) => item.name.length > 0 && item.category.length > 0),
      source: source ?? undefined,
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
      subtitle="Upload a PDF or image menu, review the extracted items, and control what the AI can quote today."
      title="Menu Control"
    >
      {!portal.canEditConfiguration ? (
        <div className="status-banner neutral">Your role does not have access to menu management.</div>
      ) : (
        <section className="menu-layout">
          <form className="surface-card stack-md menu-editor-card" onSubmit={onSubmit}>
            <div className="page-intro">
              <span className="eyebrow">Upload-first menu</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>Import menu and review extracted items</h2>
              <p className="lead" style={{ marginTop: 10 }}>
                Upload a PDF or image of your menu. We’ll extract the items, and then you can approve prices, categories, and daily availability before the AI uses them.
              </p>
            </div>

            <div className="detail-block menu-upload-card">
              <h3>Upload menu file</h3>
              <p>Supported files: PDF, JPG, JPEG, PNG. After extraction, review everything before saving.</p>
              <div className="button-row" style={{ marginTop: 14 }}>
                <label className="button-secondary file-button">
                  {importing ? "Importing menu..." : "Upload PDF or image"}
                  <input accept=".pdf,image/*" disabled={importing} onChange={onFileSelected} type="file" />
                </label>
              </div>
              {selectedFilename && !source ? (
                <p className="menu-source-note">
                  Selected file: <strong>{selectedFilename}</strong>
                </p>
              ) : null}
              {source ? (
                <p className="menu-source-note">
                  Latest import: <strong>{source.filename}</strong>{source.importedAt ? ` · ${formatImportedAt(source.importedAt)}` : ""}
                </p>
              ) : null}
            </div>

            <div className="detail-block">
              <h3>Daily availability controls</h3>
              <p>
                Mark items as available, unavailable for today, or unavailable until a specific time. The AI should only quote items that are currently available.
              </p>
            </div>

            <div className="menu-editor-list">
              {items.length === 0 ? (
                <div className="detail-block">
                  <h3>No menu items yet</h3>
                  <p>Upload a menu file to extract items automatically, or add one manually below.</p>
                </div>
              ) : null}

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
                    <div className="field">
                      <label htmlFor={`menu-availability-${index}`}>Availability</label>
                      <select
                        id={`menu-availability-${index}`}
                        onChange={(event) => updateItem(index, "availabilityMode", event.target.value)}
                        value={item.availabilityMode}
                      >
                        <option value="AVAILABLE">Available now</option>
                        <option value="DISABLED_TODAY">Unavailable today</option>
                        <option value="DISABLED_UNTIL">Unavailable until time</option>
                      </select>
                    </div>
                    {item.availabilityMode === "DISABLED_UNTIL" ? (
                      <div className="field">
                        <label htmlFor={`menu-disabled-until-${index}`}>Disable until</label>
                        <input
                          id={`menu-disabled-until-${index}`}
                          onChange={(event) => updateItem(index, "disabledUntil", event.target.value)}
                          placeholder="6:00 PM"
                          type="text"
                          value={item.disabledUntil}
                        />
                      </div>
                    ) : (
                      <div className="field-toggle compact">
                        <div>
                          <strong>Available today</strong>
                          <p>Quick toggle for today’s quoting behavior.</p>
                        </div>
                        <label className="switch">
                          <input
                            checked={item.availabilityMode === "AVAILABLE"}
                            onChange={(event) => updateItem(index, "available", event.target.checked)}
                            type="checkbox"
                          />
                          <span className="switch-slider" />
                        </label>
                      </div>
                    )}
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
                Add manual item
              </button>
            </div>

            {success ? <div className="status-banner success">{success}</div> : null}
            {error ? <div className="status-banner error">{error}</div> : null}

            <div className="button-row">
              <button className="button" disabled={saving || importing} type="submit">
                {saving ? "Saving menu..." : "Save extracted menu"}
              </button>
            </div>
          </form>

          <div className="surface-card stack-md menu-snapshot-card">
            <div className="page-intro">
              <span className="eyebrow">AI menu snapshot</span>
              <h2 className="section-title" style={{ marginTop: 14 }}>What the AI can quote today</h2>
            </div>

            <div className="detail-block">
              <h3>How the AI should behave</h3>
              <p>
                The AI should quote only saved items that are currently available. If an item is disabled for today or until a specific time, the AI should avoid offering it.
              </p>
            </div>

            <div className="menu-snapshot-list">
              {items.length === 0 ? (
                <div className="detail-block">
                  <h3>No active menu snapshot yet</h3>
                  <p>Upload and review a menu first so the AI can answer using exact item data.</p>
                </div>
              ) : (
                items.map((item, index) => (
                  <div className="detail-block menu-snapshot-item" key={`${item.name}-${index}`}>
                    <h3>{item.name}</h3>
                    <p>
                      {item.category}
                      {item.price ? ` · ${item.price}` : ""}
                    </p>
                    <p>{item.description || "No description added yet."}</p>
                    <p className="menu-availability-copy">
                      {item.availabilityMode === "AVAILABLE"
                        ? "Available now"
                        : item.availabilityMode === "DISABLED_TODAY"
                          ? "Unavailable today"
                          : `Unavailable until ${item.disabledUntil || "a later time"}`}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="detail-block">
              <h3>Next upgrade</h3>
              <p>
                After this upload-first flow is working well, we can add stronger OCR cleanup, menu category templates, and richer restaurant-specific sell/upsell behavior in calls.
              </p>
            </div>
          </div>
        </section>
      )}
    </PortalShell>
  );
}
