import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Banner, Button, Modal } from "@shopify/polaris";
import {
  ChevronRightIcon,
  ClipboardIcon,
  DeleteIcon,
  DesktopIcon,
  DragDropIcon,
  DragHandleIcon,
  DuplicateIcon,
  EditIcon,
  ExternalIcon,
  HideIcon,
  MobileIcon,
  RedoIcon,
  SettingsIcon,
  UndoIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getForm, getFormSubmissionCounts, setFormStatus, updateForm } from "../forms/forms.server";
import { defaultField, getFieldType, normalizeSchema, WIDTH_OPTIONS } from "../forms/fields";
import { buildFormCss, DEFAULT_DESKTOP_STYLE, resolveStyle } from "../forms/design";
import useBuilderHistory, {
  duplicateField,
  insertField,
  moveField,
  moveFieldToIndex,
  removeField,
  setSchemaSettings,
  setStyle,
  updateField,
  updateFieldSettings,
} from "../forms/builder-state";
import FieldPalette from "../components/forms/FieldPalette";
import FormPreview, { FormFieldPreview } from "../components/forms/FormPreview";
import FieldSettings from "../components/forms/FieldSettings";
import FormSettings from "../components/forms/FormSettings";
import DesignSettings from "../components/forms/DesignSettings";
import FieldIcon from "../components/forms/FieldIcon";
import "@shopify/polaris/build/esm/styles.css";
import "../components/forms/builder.css";

const DROP_ZONE_ID = "tclf-dropzone";
const AUTOSAVE_DELAY = 1500;
const TABS = [
  { id: "build", label: "Build" },
  { id: "design", label: "Design" },
  { id: "settings", label: "Settings" },
  { id: "publish", label: "Publish" },
];
const WIDTH_LABEL = Object.fromEntries(WIDTH_OPTIONS.map((option) => [option.value, option.label]));

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const form = await getForm(session.shop, params.formId);
  if (!form) {
    throw new Response("Form not found", { status: 404 });
  }
  const counts = await getFormSubmissionCounts(session.shop);
  return {
    form: { ...form, submissionCount: counts[form.id] || 0 },
    shop: session.shop,
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "save" || intent === "publish") {
    let doc = null;
    try {
      doc = JSON.parse(String(formData.get("doc") || "null"));
    } catch {
      doc = null;
    }
    if (!doc || typeof doc !== "object" || !doc.schema) {
      return { ok: false, message: "Couldn't read the form. Reload the page and try again." };
    }

    const updated = await updateForm(session.shop, params.formId, {
      name: doc.name,
      schema: doc.schema,
      desktopStyle: doc.desktopStyle,
      mobileStyle: doc.mobileStyle,
    });
    if (updated?.error) return { ok: false, message: updated.error };
    if (!updated) return { ok: false, message: "Form not found." };

    if (intent === "publish") {
      await setFormStatus(session.shop, params.formId, "PUBLISHED");
      return { ok: true, intent, message: "Form published." };
    }
    return { ok: true, intent, message: "Changes saved." };
  }

  if (intent === "unpublish") {
    const updated = await setFormStatus(session.shop, params.formId, "DRAFT");
    return { ok: Boolean(updated), intent, message: "Form unpublished." };
  }

  return { ok: false, message: "Unknown action." };
};

// Stored forms may predate newer field options; normalizing gives every field
// its defaults so the builder never has to guess.
function docFromForm(form) {
  return {
    name: form.name,
    schema: normalizeSchema(form.schema),
    desktopStyle: { ...DEFAULT_DESKTOP_STYLE, ...(form.desktopStyle || {}) },
    mobileStyle: form.mobileStyle || {},
  };
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function FormBuilder() {
  const { form, shop, apiKey } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = docFromForm(form);

  const { doc, update, undo, redo, select, markSaved, canUndo, canRedo, dirty, selectedFieldId } =
    useBuilderHistory(initialRef.current);

  const [tab, setTab] = useState("build");
  const [viewport, setViewport] = useState("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [bannerError, setBannerError] = useState(null);
  const [pendingIntent, setPendingIntent] = useState(null);

  const sentDocRef = useRef(null);
  const prevFetcherState = useRef(fetcher.state);

  const fields = useMemo(() => doc.schema?.fields || [], [doc.schema]);
  const selectedField = fields.find((field) => field.id === selectedFieldId) || null;
  const published = form.status === "PUBLISHED";
  const hasSubmit = fields.some((field) => field.type === "submitButton");

  // ─── Saving ────────────────────────────────────────────────────────────────

  const submitDoc = useCallback(
    (intent, nextDoc) => {
      sentDocRef.current = intent === "unpublish" ? null : nextDoc;
      const serialized = JSON.stringify(nextDoc);
      setSaveState("saving");
      setPendingIntent(intent);
      fetcher.submit({ intent, doc: serialized }, { method: "post" });
    },
    [fetcher],
  );

  // Autosave: every edit lands as a draft after a short pause.
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => submitDoc("save", doc), AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [doc, dirty, submitDoc]);

  useEffect(() => {
    const wasBusy = prevFetcherState.current !== "idle";
    prevFetcherState.current = fetcher.state;
    if (!wasBusy || fetcher.state !== "idle" || !fetcher.data) return;

    const result = fetcher.data;
    setPendingIntent(null);
    if (!result.ok) {
      setSaveState("error");
      setBannerError(result.message);
      shopify.toast.show(result.message, { isError: true });
      return;
    }
    setBannerError(null);
    if (sentDocRef.current) markSaved(sentDocRef.current);
    setSaveState("saved");
    setSavedAt(new Date());
    if (result.intent !== "save") shopify.toast.show(result.message);
  }, [fetcher.state, fetcher.data, shopify, markSaved]);

  // Warn before leaving with edits the autosave hasn't sent yet.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ─── Field operations ──────────────────────────────────────────────────────

  const addFieldOfType = (type, index = null) => {
    if (type === "submitButton" && hasSubmit) return;
    const takenKeys = fields.map((field) => field.key).filter(Boolean);
    const field = defaultField(type, takenKeys);
    if (!field) return;
    update((current) => insertField(current, field, index));
    select(field.id);
    setTab("build");
  };

  const removeSelected = (fieldId) => {
    update((current) => removeField(current, fieldId));
    if (fieldId === selectedFieldId) select(null);
  };

  const toggleVisible = (field) => update((current) => updateField(current, field.id, { visible: field.visible === false }));

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  const shortcutsRef = useRef(null);
  shortcutsRef.current = (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      submitDoc("save", doc);
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedField && selectedField.type !== "submitButton") {
      event.preventDefault();
      removeSelected(selectedField.id);
    } else if (event.key === "Escape" && selectedField) {
      select(null);
    }
  };
  useEffect(() => {
    const handler = (event) => shortcutsRef.current?.(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Drag and drop ─────────────────────────────────────────────────────────

  const sensors = useSensors(
    // A small activation distance keeps click-to-add and click-to-select working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = ({ active }) => {
    setActiveDrag({
      id: active.id,
      source: active.data.current?.source,
      fieldType: active.data.current?.fieldType || null,
    });
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null);
    if (!over) return;

    if (active.data.current?.source === "palette") {
      const index = over.id === DROP_ZONE_ID ? 0 : fields.findIndex((field) => field.id === over.id);
      addFieldOfType(active.data.current.fieldType, index === -1 ? null : index);
      return;
    }

    if (over.id === DROP_ZONE_ID) {
      update((current) => moveFieldToIndex(current, String(active.id), 0));
    } else if (active.id !== over.id) {
      update((current) => moveField(current, String(active.id), String(over.id)));
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const resolvedStyle = resolveStyle(doc.desktopStyle, doc.mobileStyle, viewport);
  const mobileOverrideCount = Object.keys(doc.mobileStyle || {}).filter(
    (key) => doc.mobileStyle[key] !== undefined && doc.mobileStyle[key] !== "",
  ).length;

  const preview = (
    <FormPreview
      publicId={`${form.publicId}-preview`}
      schema={doc.schema}
      desktopStyle={doc.desktopStyle}
      mobileStyle={doc.mobileStyle}
      viewport={viewport}
      interactive
      onSubmitPreview={() => shopify.toast.show("Preview only — nothing was submitted.")}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="fb-root">
        <FieldPalette
          onAddField={(type) => addFieldOfType(type)}
          disabledTypes={hasSubmit ? { submitButton: "Your form already has a submit button." } : {}}
        />

        <main className="fb-main">
          <nav className="fb-breadcrumb" aria-label="Breadcrumb">
            <Link to="/app/forms">Forms</Link>
            <ChevronRightIcon width={16} height={16} fill="currentColor" aria-hidden="true" />
            <span className="fb-breadcrumb__current">{doc.name}</span>
          </nav>

          <header className="fb-header">
            <div className="fb-header__title">
              <EditableTitle
                value={doc.name}
                onChange={(name) => update((current) => ({ ...current, name }), "form-name")}
              />
              <span className={`fb-badge${published ? " fb-badge--success" : ""}`}>
                {published ? "Published" : "Draft"}
              </span>
            </div>
            <div className="fb-header__actions">
              <SaveIndicator state={saveState} savedAt={savedAt} dirty={dirty} />
              <button type="button" className="fb-icon-btn" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
                <UndoIcon width={20} height={20} fill="currentColor" />
              </button>
              <button type="button" className="fb-icon-btn" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
                <RedoIcon width={20} height={20} fill="currentColor" />
              </button>
              <button type="button" className="fb-btn" onClick={() => setPreviewOpen(true)}>
                <ViewIcon width={20} height={20} fill="currentColor" aria-hidden="true" />
                Preview
              </button>
              <button
                type="button"
                className="fb-btn"
                onClick={() => submitDoc("save", doc)}
                disabled={!dirty || pendingIntent !== null}
              >
                {pendingIntent === "save" && dirty ? "Saving…" : "Save"}
              </button>
              {published ? (
                <button
                  type="button"
                  className="fb-btn"
                  onClick={() => submitDoc("unpublish", doc)}
                  disabled={pendingIntent !== null}
                >
                  {pendingIntent === "unpublish" ? "Unpublishing…" : "Unpublish"}
                </button>
              ) : (
                <button
                  type="button"
                  className="fb-btn fb-btn--primary"
                  onClick={() => submitDoc("publish", doc)}
                  disabled={pendingIntent !== null}
                >
                  {pendingIntent === "publish" ? "Publishing…" : "Publish"}
                </button>
              )}
            </div>
          </header>

          {bannerError && (
            <div style={{ marginBottom: 16 }}>
              <Banner tone="critical" title="Couldn't save your changes" onDismiss={() => setBannerError(null)}>
                <p>{bannerError}</p>
              </Banner>
            </div>
          )}

          <div className="fb-tabs" role="tablist" aria-label="Form builder sections">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={`fb-tab-${entry.id}`}
                aria-selected={tab === entry.id}
                aria-controls={`fb-tabpanel-${entry.id}`}
                className="fb-tab"
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`fb-tabpanel-${tab}`} aria-labelledby={`fb-tab-${tab}`}>
            {tab === "build" && (
              <Canvas
                publicId={form.publicId}
                doc={doc}
                fields={fields}
                selectedFieldId={selectedFieldId}
                onSelect={(fieldId) => select(fieldId)}
                onDuplicate={(fieldId) => update((current) => duplicateField(current, fieldId))}
                onRemove={removeSelected}
                onToggleVisible={toggleVisible}
              />
            )}

            {tab === "design" && (
              <div className="fb-card">
                <PreviewToolbar viewport={viewport} onViewport={setViewport} title="Live preview" />
                <div className="fb-preview-stage">
                  <div className={`fb-preview-frame${viewport === "mobile" ? " fb-preview-frame--mobile" : ""}`}>
                    {preview}
                  </div>
                </div>
              </div>
            )}

            {tab === "settings" && (
              <div className="fb-card fb-card--flush">
                <FormSettings
                  settings={doc.schema.settings}
                  updateSetting={(patch) => update((current) => setSchemaSettings(current, patch), "form-settings")}
                />
              </div>
            )}

            {tab === "publish" && (
              <PublishPanel
                form={form}
                shop={shop}
                apiKey={apiKey}
                published={published}
                busy={pendingIntent !== null}
                onPublish={() => submitDoc("publish", doc)}
                onUnpublish={() => submitDoc("unpublish", doc)}
                onCopied={() => shopify.toast.show("Form ID copied")}
              />
            )}
          </div>
        </main>

        <aside className="fb-panel" aria-label="Settings panel">
          {tab === "build" &&
            (selectedField ? (
              <FieldSettings
                key={selectedField.id}
                field={selectedField}
                otherFields={fields.filter((field) => field.id !== selectedFieldId)}
                onUpdate={(patch) =>
                  update((current) => updateField(current, selectedFieldId, patch), `field-${selectedFieldId}`)
                }
                onUpdateSection={(section, patch) =>
                  update(
                    (current) => updateFieldSettings(current, selectedFieldId, section, patch),
                    `field-${selectedFieldId}-${section}`,
                  )
                }
                onRemove={() => removeSelected(selectedFieldId)}
                onDuplicate={() => update((current) => duplicateField(current, selectedFieldId))}
                onClose={() => select(null)}
              />
            ) : (
              <>
                <div className="fb-panel__header">
                  <h2 className="fb-panel__title">Field settings</h2>
                </div>
                <div className="fb-panel__empty">
                  <SettingsIcon width={28} height={28} fill="#8a8a8a" aria-hidden="true" />
                  <strong style={{ color: "#303030" }}>No field selected</strong>
                  <span>Click a field on the canvas to edit its label, validation, layout and more.</span>
                </div>
              </>
            ))}

          {tab === "design" && (
            <>
              <div className="fb-panel__header">
                <h2 className="fb-panel__title">Design</h2>
              </div>
              <div className="fb-seg fb-seg--compact" role="group" aria-label="Viewport" style={{ marginBottom: 8 }}>
                <button type="button" aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>
                  <DesktopIcon width={18} height={18} fill="currentColor" aria-hidden="true" /> Desktop
                </button>
                <button type="button" aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>
                  <MobileIcon width={18} height={18} fill="currentColor" aria-hidden="true" /> Mobile
                </button>
              </div>
              <p className="fb-help" style={{ marginBottom: 12 }}>
                {viewport === "mobile"
                  ? "Changes here apply to phones only. Anything you don't change uses the desktop value."
                  : "These styles apply everywhere unless you override them for mobile."}
              </p>
              {viewport === "mobile" && mobileOverrideCount > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Button
                    variant="plain"
                    onClick={() => update((current) => ({ ...current, mobileStyle: {} }))}
                  >
                    {`Reset ${mobileOverrideCount} mobile override${mobileOverrideCount === 1 ? "" : "s"}`}
                  </Button>
                </div>
              )}
              <DesignSettings
                style={resolvedStyle}
                onChange={(patch) => update((current) => setStyle(current, viewport, patch), `style-${viewport}`)}
              />
            </>
          )}

          {(tab === "settings" || tab === "publish") && (
            <>
              <div className="fb-panel__header">
                <h2 className="fb-panel__title">Live preview</h2>
              </div>
              <div className="fb-preview-stage" style={{ padding: 12 }}>
                <div className="fb-preview-frame">
                  <FormPreview
                    publicId={`${form.publicId}-side`}
                    schema={doc.schema}
                    desktopStyle={doc.desktopStyle}
                    mobileStyle={doc.mobileStyle}
                    viewport="mobile"
                    interactive
                    onSubmitPreview={() => shopify.toast.show("Preview only — nothing was submitted.")}
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <DragOverlay>{activeDrag ? <DragOverlayCard drag={activeDrag} fields={fields} /> : null}</DragOverlay>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Preview: ${doc.name}`} size="large">
        <Modal.Section>
          <PreviewToolbar
            viewport={viewport}
            onViewport={setViewport}
            title="Fill it in to try conditional fields. Nothing is submitted."
          />
          <div className="fb-preview-stage">
            <div className={`fb-preview-frame${viewport === "mobile" ? " fb-preview-frame--mobile" : ""}`}>{preview}</div>
          </div>
        </Modal.Section>
      </Modal>
    </DndContext>
  );
}

// ─── Header pieces ───────────────────────────────────────────────────────────

function EditableTitle({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onChange(next.slice(0, 120));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="fb-title-input"
        value={draft}
        maxLength={120}
        aria-label="Form name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <>
      <h1 className="fb-title" title={value}>
        {value}
      </h1>
      <button
        type="button"
        className="fb-icon-btn"
        aria-label="Rename form"
        title="Rename form"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <EditIcon width={20} height={20} fill="currentColor" />
      </button>
    </>
  );
}

function SaveIndicator({ state, savedAt, dirty }) {
  if (state === "saving") return <span className="fb-save-state">Saving…</span>;
  if (state === "error") return <span className="fb-save-state fb-save-state--error">Not saved</span>;
  if (dirty) return <span className="fb-save-state">Unsaved changes</span>;
  if (savedAt) {
    return (
      <span className="fb-save-state">
        Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return <span className="fb-save-state">All changes saved</span>;
}

function PreviewToolbar({ viewport, onViewport, title }) {
  return (
    <div className="fb-preview-toolbar">
      <span className="fb-help" style={{ margin: 0 }}>
        {title}
      </span>
      <div className="fb-seg fb-seg--compact" role="group" aria-label="Preview size">
        <button type="button" aria-pressed={viewport === "desktop"} onClick={() => onViewport("desktop")}>
          <DesktopIcon width={18} height={18} fill="currentColor" aria-hidden="true" /> Desktop
        </button>
        <button type="button" aria-pressed={viewport === "mobile"} onClick={() => onViewport("mobile")}>
          <MobileIcon width={18} height={18} fill="currentColor" aria-hidden="true" /> Mobile
        </button>
      </div>
    </div>
  );
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

function Canvas({ publicId, doc, fields, selectedFieldId, onSelect, onDuplicate, onRemove, onToggleVisible }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID });
  const scope = `${publicId}-canvas`;
  const css = buildFormCss({ publicId: scope, desktop: doc.desktopStyle, mobile: doc.mobileStyle });
  const style = resolveStyle(doc.desktopStyle, doc.mobileStyle, "desktop");

  return (
    <div className="fb-card">
      <div ref={setNodeRef} className={`fb-dropzone${isOver ? " fb-dropzone--over" : ""}`}>
        <span className="fb-dropzone__title">
          <DragDropIcon width={20} height={20} fill="currentColor" aria-hidden="true" />
          Drag form elements here
        </span>
        <span className="fb-dropzone__hint">
          Build your form by dragging elements from the left panel, or click one to add it.
        </span>
      </div>

      <div
        className={`tclf-form--${scope}`}
        data-input-style={style.inputStyle}
        style={{ maxWidth: "none", textAlign: "left" }}
      >
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <div className="fb-list" style={{ flexDirection: "column", flexWrap: "nowrap" }}>
            {fields.map((field) => (
              <CanvasRow
                key={field.id}
                field={field}
                fields={fields}
                submitText={doc.schema.settings?.submitText}
                buttonStyle={style.buttonStyle}
                selected={selectedFieldId === field.id}
                onSelect={() => onSelect(field.id)}
                onDuplicate={() => onDuplicate(field.id)}
                onRemove={() => onRemove(field.id)}
                onToggleVisible={() => onToggleVisible(field)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

function CanvasRow({ field, fields, submitText, buttonStyle, selected, onSelect, onDuplicate, onRemove, onToggleVisible }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { source: "canvas" },
  });
  const meta = getFieldType(field.type);
  const isSubmit = field.type === "submitButton";
  const visible = field.visible !== false;
  const conditionSource = field.conditional?.fieldId
    ? fields.find((entry) => entry.id === field.conditional.fieldId)
    : null;
  const name = field.label || meta?.label || "field";

  const stop = (handler) => (event) => {
    event.stopPropagation();
    handler();
  };

  return (
    // Clicking the card is a mouse shortcut; the gear button is the keyboard path.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      className={`fb-row${selected ? " fb-row--selected" : ""}${isDragging ? " fb-row--dragging" : ""}${visible ? "" : " fb-row--off"}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
    >
      <button
        type="button"
        className="fb-row__handle"
        aria-label={`Reorder ${name}`}
        title="Drag to reorder"
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon width={18} height={18} fill="currentColor" />
      </button>

      <div className="fb-row__body">
        {(!visible || conditionSource || field.width !== "full") && (
          <div className="fb-row__meta">
            {!visible && <span className="fb-badge fb-badge--muted">Hidden</span>}
            {conditionSource && (
              <span className="fb-badge fb-badge--muted">Shown when “{conditionSource.label}” is answered</span>
            )}
            {field.width !== "full" && <span className="fb-badge fb-badge--muted">{WIDTH_LABEL[field.width]} width</span>}
          </div>
        )}
        {field.type === "hiddenField" ? (
          <div>
            <div className="tclf-label">{field.label}</div>
            <div className="tclf-help">Hidden value: {field.defaultValue || "(empty)"}</div>
          </div>
        ) : (
          <FormFieldPreview
            field={field}
            uid="canvas"
            submitText={submitText}
            buttonStyle={buttonStyle}
            bare
          />
        )}
      </div>

      <div className="fb-row__actions">
        <button
          type="button"
          className={`fb-icon-btn${selected ? " fb-icon-btn--active" : ""}`}
          aria-label={`Edit settings for ${name}`}
          title="Field settings"
          onClick={stop(onSelect)}
        >
          <SettingsIcon width={20} height={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className="fb-icon-btn"
          aria-label={`Duplicate ${name}`}
          title={isSubmit ? "A form has one submit button" : "Duplicate"}
          onClick={stop(onDuplicate)}
          disabled={isSubmit}
        >
          <DuplicateIcon width={20} height={20} fill="currentColor" />
        </button>
        <button
          type="button"
          className="fb-icon-btn"
          aria-label={visible ? `Hide ${name} from the form` : `Show ${name} on the form`}
          aria-pressed={!visible}
          title={isSubmit ? "The submit button is always shown" : visible ? "Hide from form" : "Show on form"}
          onClick={stop(onToggleVisible)}
          disabled={isSubmit}
        >
          {visible ? (
            <ViewIcon width={20} height={20} fill="currentColor" />
          ) : (
            <HideIcon width={20} height={20} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          className="fb-icon-btn fb-icon-btn--critical"
          aria-label={`Delete ${name}`}
          title={isSubmit ? "Every form needs a submit button" : "Delete"}
          onClick={stop(onRemove)}
          disabled={isSubmit}
        >
          <DeleteIcon width={20} height={20} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

function DragOverlayCard({ drag, fields }) {
  const field = drag.source === "canvas" ? fields.find((entry) => entry.id === drag.id) : null;
  const meta = getFieldType(drag.fieldType || field?.type);
  return (
    <div className="fb-dragcard">
      <FieldIcon name={meta?.icon} size={20} />
      {field?.label || meta?.label || "Field"}
    </div>
  );
}

// ─── Publish ─────────────────────────────────────────────────────────────────

function PublishPanel({ form, shop, apiKey, published, busy, onPublish, onUnpublish, onCopied }) {
  const editorUrl =
    shop && apiKey
      ? `https://${shop}/admin/themes/current/editor?template=index&addAppBlockId=${apiKey}/form&target=newAppsSection`
      : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(form.publicId);
      onCopied();
    } catch {
      window.prompt("Copy this form ID:", form.publicId);
    }
  };

  return (
    <>
      <div className="fb-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>
              {published ? "Your form is live" : "Your form is a draft"}
            </h2>
            <p className="fb-help">
              {published
                ? "Visitors can see and submit it wherever you've added it to your theme. Edits save straight to the live form."
                : "Publish it so it can be shown on your storefront. Drafts are never visible to visitors."}
            </p>
          </div>
          {published ? (
            <button type="button" className="fb-btn" onClick={onUnpublish} disabled={busy}>
              Unpublish
            </button>
          ) : (
            <button type="button" className="fb-btn fb-btn--primary" onClick={onPublish} disabled={busy}>
              Publish form
            </button>
          )}
        </div>
      </div>

      <div className="fb-card">
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 650 }}>Add it to your store</h2>
        <div className="fb-publish-step">
          <span className="fb-publish-step__num">1</span>
          <div>
            <strong>Copy the form ID</strong>
            <div className="fb-copy">
              <code>{form.publicId}</code>
              <Button icon={ClipboardIcon} onClick={copy}>
                Copy
              </Button>
            </div>
          </div>
        </div>
        <div className="fb-publish-step">
          <span className="fb-publish-step__num">2</span>
          <div>
            <strong>Add the “TCL Form” block in the theme editor</strong>
            <p className="fb-help">Open your theme, add the block to any page section, and paste the ID into its “Form public ID” setting.</p>
            {editorUrl && (
              <div style={{ marginTop: 8 }}>
                <a className="fb-btn" href={editorUrl} target="_top" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <ExternalIcon width={18} height={18} fill="currentColor" aria-hidden="true" />
                  Open theme editor
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="fb-publish-step">
          <span className="fb-publish-step__num">3</span>
          <div>
            <strong>Save the theme and collect responses</strong>
            <p className="fb-help">
              Submissions appear on the <Link to={`/app/submissions?formId=${form.id}`}>Submissions</Link> page.
              {` This form has ${form.submissionCount.toLocaleString()} so far.`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
