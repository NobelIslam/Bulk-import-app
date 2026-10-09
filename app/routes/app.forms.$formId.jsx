import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Banner, Button, ButtonGroup, Modal, Tabs, Tooltip } from "@shopify/polaris";
import {
  ChevronRightIcon,
  ClipboardIcon,
  CodeIcon,
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
  ThemeEditIcon,
  UndoIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getForm, getFormSubmissionCounts, setFormStatus, updateForm } from "../forms/forms.server";
import { defaultField, getFieldType, normalizeSchema, splitColumns, WIDTH_OPTIONS } from "../forms/fields";
import { DEFAULT_DESKTOP_STYLE, resolveStyle } from "../forms/design";
import useBuilderHistory, {
  duplicateField,
  insertField,
  moveField,
  placeField,
  removeField,
  setSchemaSettings,
  setStyle,
  updateField,
  updateFieldSettings,
} from "../forms/builder-state";
import FieldPalette from "../components/forms/FieldPalette";
import FormPreview, { columnProps, FormFieldPreview, FormShell } from "../components/forms/FormPreview";
import FieldSettings from "../components/forms/FieldSettings";
import FormSettings from "../components/forms/FormSettings";
import DesignSettings from "../components/forms/DesignSettings";
import FieldIcon from "../components/forms/FieldIcon";
import "@shopify/polaris/build/esm/styles.css";
import "../components/forms/builder.css";

const DROP_ZONE_ID = "tclf-dropzone";
const MAIN_DROP_ID = "tclf-column-main";
const SIDE_DROP_ID = "tclf-column-side";
const CONTAINER_IDS = [DROP_ZONE_ID, MAIN_DROP_ID, SIDE_DROP_ID];

// Prefer the field under the pointer; over a column's empty space, drop into
// that column; otherwise fall back to the nearest target.
function collisionDetection(args) {
  const within = pointerWithin(args);
  if (within.length) {
    const items = within.filter((entry) => !CONTAINER_IDS.includes(entry.id));
    if (items.length) {
      const ids = items.map((entry) => entry.id);
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((entry) => ids.includes(entry.id)),
      });
    }
    return within;
  }
  return closestCenter(args);
}
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
    shopify.toast.show(result.message);
  }, [fetcher.state, fetcher.data, shopify, markSaved]);

  // Changes are only stored when the merchant saves, so leaving with unsaved
  // edits asks first: the blocker covers in-app links, beforeunload covers
  // reloads and closing the tab.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );

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

  // `column`/`beforeId` come from a drop; a click appends to the main column.
  const addFieldOfType = (type, column = "main", beforeId = null) => {
    if (type === "submitButton" && hasSubmit) return;
    const takenKeys = fields.map((field) => field.key).filter(Boolean);
    const field = defaultField(type, takenKeys);
    if (!field) return;
    update((current) =>
      column === "main" && !beforeId ? insertField(current, field) : placeField(current, field, column, beforeId),
    );
    select(field.id);
    setTab("build");
  };

  const removeSelected = (fieldId) => {
    update((current) => removeField(current, fieldId));
    if (fieldId === selectedFieldId) select(null);
  };

  const toggleVisible = (field) => update((current) => updateField(current, field.id, { visible: field.visible === false }));

  const showError = useCallback((message) => shopify.toast.show(message, { isError: true }), [shopify]);

  // Two columns need room: widen a narrow form so the fields aren't squeezed.
  const changeLayout = (layout) =>
    update((current) => {
      const next = setSchemaSettings(current, { layout });
      const width = Number(current.desktopStyle?.formWidth) || DEFAULT_DESKTOP_STYLE.formWidth;
      if (layout === "twoColumn" && width < 900) {
        return { ...next, desktopStyle: { ...next.desktopStyle, formWidth: 960 } };
      }
      return next;
    });

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

  // Where a drop lands: the column, and the field to insert before (null = end).
  const dropTarget = (overId) => {
    const columns = splitColumns(fields, doc.schema.settings);
    if (overId === SIDE_DROP_ID) return { column: "side", beforeId: null };
    if (overId === MAIN_DROP_ID) return { column: "main", beforeId: null };
    if (overId === DROP_ZONE_ID) return { column: "main", beforeId: columns.main[0]?.id || null };
    const overField = fields.find((field) => field.id === overId);
    if (!overField) return null;
    return { column: columns.side.includes(overField) ? "side" : "main", beforeId: overField.id };
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null);
    if (!over) return;
    const target = dropTarget(over.id);
    if (!target) return;

    if (active.data.current?.source === "palette") {
      addFieldOfType(active.data.current.fieldType, target.column, target.beforeId);
      return;
    }

    const moving = fields.find((field) => field.id === active.id);
    if (!moving || active.id === over.id) return;
    const twoColumn = doc.schema.settings?.layout === "twoColumn";
    const fromColumn = twoColumn && moving.column === "side" ? "side" : "main";
    if (fromColumn === target.column && target.beforeId) {
      // Same column: a sortable move, so dragging down lands after the target.
      update((current) => moveField(current, moving.id, target.beforeId));
    } else {
      update((current) => placeField(current, moving, target.column, target.beforeId));
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

  const showPanel = tab === "build" || tab === "design";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className={`fb-root${showPanel ? "" : " fb-root--no-panel"}`}>
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
              <Tooltip content="Undo (Ctrl+Z)">
                <Button icon={UndoIcon} variant="tertiary" accessibilityLabel="Undo" onClick={undo} disabled={!canUndo} />
              </Tooltip>
              <Tooltip content="Redo (Ctrl+Shift+Z)">
                <Button icon={RedoIcon} variant="tertiary" accessibilityLabel="Redo" onClick={redo} disabled={!canRedo} />
              </Tooltip>
              <Button icon={ViewIcon} onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
              <Button
                onClick={() => submitDoc("save", doc)}
                disabled={!dirty || (pendingIntent !== null && pendingIntent !== "save")}
                loading={pendingIntent === "save"}
              >
                Save
              </Button>
              {published ? (
                <Button
                  onClick={() => submitDoc("unpublish", doc)}
                  disabled={pendingIntent !== null && pendingIntent !== "unpublish"}
                  loading={pendingIntent === "unpublish"}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  variant="primary"
                  tone="success"
                  onClick={() => submitDoc("publish", doc)}
                  disabled={pendingIntent !== null && pendingIntent !== "publish"}
                  loading={pendingIntent === "publish"}
                >
                  Publish
                </Button>
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

          <div className="fb-tabs">
            <Tabs
              tabs={TABS.map((entry) => ({ id: `fb-tab-${entry.id}`, content: entry.label, panelID: `fb-tabpanel-${entry.id}` }))}
              selected={Math.max(TABS.findIndex((entry) => entry.id === tab), 0)}
              onSelect={(index) => setTab(TABS[index].id)}
            />
          </div>

          <div role="tabpanel" id={`fb-tabpanel-${tab}`} aria-labelledby={`fb-tab-${tab}`}>
            {tab === "build" && (
              <Canvas
                publicId={form.publicId}
                doc={doc}
                fields={fields}
                viewport={viewport}
                onViewport={setViewport}
                onEditLayout={() => setTab("settings")}
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
                  updateSetting={(patch) =>
                    update((current) => setSchemaSettings(current, patch), `form-settings-${Object.keys(patch).join("-")}`)
                  }
                  onLayoutChange={changeLayout}
                  onError={showError}
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
                onCopied={(what) => shopify.toast.show(`${what} copied`)}
              />
            )}
          </div>
        </main>

        {showPanel && (
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
                onError={showError}
                twoColumn={doc.schema.settings?.layout === "twoColumn"}
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
              <div style={{ marginBottom: 8 }}>
                <ViewportToggle viewport={viewport} onViewport={setViewport} fullWidth />
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

        </aside>
        )}
      </div>

      <DragOverlay>{activeDrag ? <DragOverlayCard drag={activeDrag} fields={fields} /> : null}</DragOverlay>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        primaryAction={{ content: "Leave without saving", destructive: true, onAction: () => blocker.proceed?.() }}
        secondaryActions={[{ content: "Stay on this page", onAction: () => blocker.reset?.() }]}
      >
        <Modal.Section>
          <p>You have unsaved changes to this form. If you leave now, they&apos;ll be lost.</p>
        </Modal.Section>
      </Modal>

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
      <Tooltip content="Rename form">
        <Button
          icon={EditIcon}
          variant="tertiary"
          accessibilityLabel="Rename form"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        />
      </Tooltip>
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
      <ViewportToggle viewport={viewport} onViewport={onViewport} />
    </div>
  );
}

function ViewportToggle({ viewport, onViewport, fullWidth = false }) {
  return (
    <ButtonGroup variant="segmented" fullWidth={fullWidth}>
      <Button icon={DesktopIcon} pressed={viewport === "desktop"} onClick={() => onViewport("desktop")}>
        Desktop
      </Button>
      <Button icon={MobileIcon} pressed={viewport === "mobile"} onClick={() => onViewport("mobile")}>
        Mobile
      </Button>
    </ButtonGroup>
  );
}

// ─── Canvas ──────────────────────────────────────────────────────────────────
// The Build tab renders the form through the same FormShell as the Design
// preview and the storefront, so every style, width, layout and custom CSS
// change is visible here immediately. Builder chrome (outline, toolbar) sits
// on top of each field without changing its layout.

function Canvas({
  publicId,
  doc,
  fields,
  viewport,
  onViewport,
  onEditLayout,
  selectedFieldId,
  onSelect,
  onDuplicate,
  onRemove,
  onToggleVisible,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID });
  const style = resolveStyle(doc.desktopStyle, doc.mobileStyle, viewport);
  const twoColumn = doc.schema.settings?.layout === "twoColumn";
  const columns = splitColumns(fields, doc.schema.settings);
  const rowProps = (field) => ({
    field,
    fields,
    submitText: doc.schema.settings?.submitText,
    buttonStyle: style.buttonStyle,
    selected: selectedFieldId === field.id,
    onSelect: () => onSelect(field.id),
    onDuplicate: () => onDuplicate(field.id),
    onRemove: () => onRemove(field.id),
    onToggleVisible: () => onToggleVisible(field),
  });

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

      <PreviewToolbar
        viewport={viewport}
        onViewport={onViewport}
        title={
          twoColumn ? (
            <>
              Two-column layout.{" "}
              <Button variant="plain" onClick={onEditLayout}>
                Edit side column
              </Button>
            </>
          ) : (
            "Click a field to edit it. Drag the handle to reorder."
          )
        }
      />

      <div className="fb-canvas-stage">
        <div className={`fb-preview-frame${viewport === "mobile" ? " fb-preview-frame--mobile" : ""}`}>
          <FormShell
            scopeId={`${publicId}-canvas`}
            desktopStyle={doc.desktopStyle}
            mobileStyle={doc.mobileStyle}
            settings={doc.schema.settings}
            viewport={viewport}
            sideChildren={
              <CanvasColumn id={SIDE_DROP_ID} fields={columns.side} rowProps={rowProps} emptyHint="Drag elements here, like an Image, Heading or Paragraph" />
            }
          >
            <CanvasColumn id={MAIN_DROP_ID} fields={columns.main} rowProps={rowProps} emptyHint="Drag elements here" />
          </FormShell>
        </div>
      </div>
    </div>
  );
}

// One column of the canvas: a drop target (so empty columns accept drops) and
// its own sortable list.
function CanvasColumn({ id, fields, rowProps, emptyHint }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext items={fields.map((field) => field.id)} strategy={rectSortingStrategy}>
      <div ref={setNodeRef} className={`tclf-grid fb-canvas-grid${isOver ? " fb-canvas-grid--over" : ""}`}>
        {fields.length === 0 && <div className="fb-column-empty">{emptyHint}</div>}
        {fields.map((field) => (
          <CanvasRow key={field.id} {...rowProps(field)} />
        ))}
      </div>
    </SortableContext>
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
  const column = columnProps(field);

  const stop = (handler) => (event) => {
    event.stopPropagation();
    handler();
  };

  return (
    // Clicking the field is a mouse shortcut; the gear button is the keyboard path.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      {...column}
      className={`${column.className} fb-row${selected ? " fb-row--selected" : ""}${isDragging ? " fb-row--dragging" : ""}${visible ? "" : " fb-row--off"}`}
      style={{ ...column.style, transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
    >
      {(!visible || conditionSource || field.type === "hiddenField") && (
        <div className="fb-row__meta">
          {!visible && <span className="fb-badge fb-badge--muted">Hidden</span>}
          {field.type === "hiddenField" && <span className="fb-badge fb-badge--muted">Not shown to visitors</span>}
          {conditionSource && (
            <span className="fb-badge fb-badge--muted">Shown when “{conditionSource.label}” is answered</span>
          )}
        </div>
      )}

      <div className="fb-row__toolbar">
        <button
          type="button"
          className="fb-row__handle"
          aria-label={`Reorder ${name}`}
          title="Drag to reorder"
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <DragHandleIcon width={16} height={16} fill="currentColor" />
        </button>
        <span className="fb-row__type">
          {meta?.label}
          {field.width !== "full" ? ` · ${WIDTH_LABEL[field.width]}` : ""}
        </span>
        {/* Polaris passes the click event through, so the row's own select handler can be skipped. */}
        <Tooltip content="Field settings">
          <Button
            icon={SettingsIcon}
            size="slim"
            variant="tertiary"
            pressed={selected}
            accessibilityLabel={`Edit settings for ${name}`}
            onClick={stop(onSelect)}
          />
        </Tooltip>
        <Tooltip content={isSubmit ? "A form has one submit button" : "Duplicate"}>
          <Button
            icon={DuplicateIcon}
            size="slim"
            variant="tertiary"
            accessibilityLabel={`Duplicate ${name}`}
            onClick={stop(onDuplicate)}
            disabled={isSubmit}
          />
        </Tooltip>
        <Tooltip content={isSubmit ? "The submit button is always shown" : visible ? "Hide from form" : "Show on form"}>
          <Button
            icon={visible ? ViewIcon : HideIcon}
            size="slim"
            variant="tertiary"
            pressed={!visible}
            accessibilityLabel={visible ? `Hide ${name} from the form` : `Show ${name} on the form`}
            onClick={stop(onToggleVisible)}
            disabled={isSubmit}
          />
        </Tooltip>
        <Tooltip content={isSubmit ? "Every form needs a submit button" : "Delete"}>
          <Button
            icon={DeleteIcon}
            size="slim"
            variant="tertiary"
            tone="critical"
            accessibilityLabel={`Delete ${name}`}
            onClick={stop(onRemove)}
            disabled={isSubmit}
          />
        </Tooltip>
      </div>

      <div className="fb-row__body">
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

// Must match the app block's file name: extensions/tcl-forms/blocks/form.liquid.
const APP_BLOCK_HANDLE = "form";
const APP_EMBED_HANDLE = "app-embed";

function formEmbedCode(publicId) {
  return `<div data-tcl-form="${publicId}"></div>\n<script src="/apps/forms/embed.js" defer></script>`;
}

function PublishPanel({ form, shop, apiKey, published, busy, onPublish, onUnpublish, onCopied }) {
  const editorBase = shop ? `https://${shop}/admin/themes/current/editor` : null;
  const blockUrl =
    editorBase && apiKey
      ? `${editorBase}?template=index&addAppBlockId=${apiKey}/${APP_BLOCK_HANDLE}&target=newAppsSection`
      : null;
  const embedUrl =
    editorBase && apiKey ? `${editorBase}?context=apps&activateAppId=${apiKey}/${APP_EMBED_HANDLE}` : null;
  const embedCode = formEmbedCode(form.publicId);
  const shortCode = `<div data-tcl-form="${form.publicId}"></div>`;

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
            <Button onClick={onUnpublish} disabled={busy}>
              Unpublish
            </Button>
          ) : (
            <Button variant="primary" tone="success" onClick={onPublish} disabled={busy}>
              Publish form
            </Button>
          )}
        </div>
      </div>

      <div className="fb-card">
        <h2 className="fb-publish-title">
          <ThemeEditIcon width={20} height={20} fill="currentColor" aria-hidden="true" />
          Option 1: Add it with a theme block
        </h2>
        <p className="fb-help" style={{ marginBottom: 8 }}>
          Works in any Online Store 2.0 theme, on any page and in any section that accepts app blocks.
        </p>
        <div className="fb-publish-step">
          <span className="fb-publish-step__num">1</span>
          <div>
            <strong>Copy the form ID</strong>
            <CopyField value={form.publicId} label="Form ID" onCopied={onCopied} />
          </div>
        </div>
        <div className="fb-publish-step">
          <span className="fb-publish-step__num">2</span>
          <div>
            <strong>Add the “TCL Form” block in the theme editor</strong>
            <p className="fb-help">
              Click <em>Add block</em> (or <em>Add section → Apps</em>) wherever you want the form, choose “TCL Form”,
              and paste the ID into its “Form ID” setting.
            </p>
            {blockUrl && (
              <div style={{ marginTop: 8 }}>
                <Button icon={ExternalIcon} url={blockUrl} target="_top">
                  Open theme editor
                </Button>
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

      <div className="fb-card">
        <h2 className="fb-publish-title">
          <CodeIcon width={20} height={20} fill="currentColor" aria-hidden="true" />
          Option 2: Paste the form code anywhere
        </h2>
        <p className="fb-help" style={{ marginBottom: 12 }}>
          Paste this into a <em>Custom Liquid</em> section or block, any theme file (.liquid), or a page template. The
          form loads itself, so no theme block is needed.
        </p>
        <CopyField value={embedCode} label="Form code" multiline onCopied={onCopied} />

        <div className="fb-publish-note">
          <strong>Embedding in places that strip scripts</strong> (page content, blog posts, product descriptions)?
          Turn on the “TCL Forms Embed” app embed once, then paste just this short code:
          <CopyField value={shortCode} label="Short code" onCopied={onCopied} />
          {embedUrl && (
            <div style={{ marginTop: 8 }}>
              <Button icon={ExternalIcon} url={embedUrl} target="_top">
                Turn on app embed
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Clipboard writes can be blocked inside the embedded admin; when they are, the
// text is selected so the merchant can press Ctrl+C.
function CopyField({ value, label, multiline = false, onCopied }) {
  const ref = useRef(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      onCopied(label);
    } catch {
      ref.current?.focus();
      ref.current?.select();
    }
  };
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className={`fb-copy${multiline ? " fb-copy--multiline" : ""}`}>
      <Tag
        ref={ref}
        className="fb-copy__value"
        readOnly
        value={value}
        aria-label={label}
        rows={multiline ? 2 : undefined}
        onFocus={(event) => event.target.select()}
      />
      <Button icon={ClipboardIcon} onClick={copy}>
        Copy
      </Button>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
