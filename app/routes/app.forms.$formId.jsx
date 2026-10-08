import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
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
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Divider,
  InlineStack,
  Page,
  Tabs,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import {
  DesktopIcon,
  DragHandleIcon,
  DuplicateIcon,
  MobileIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getForm, getFormSubmissionCounts, setFormStatus, updateForm } from "../forms/forms.server";
import { getFieldType } from "../forms/fields";
import { buildFormCss, DEFAULT_DESKTOP_STYLE } from "../forms/design";
import useBuilderHistory, {
  addField,
  duplicateField,
  moveField,
  removeField,
  setSchemaSettings,
  updateField,
  updateFieldSettings,
  setStyle,
} from "../forms/builder-state";
import FieldPalette from "../components/forms/FieldPalette";
import FormPreview, { FormFieldPreview } from "../components/forms/FormPreview";
import FieldSettings from "../components/forms/FieldSettings";
import FormSettings from "../components/forms/FormSettings";
import DesignSettings from "../components/forms/DesignSettings";
import FieldIcon from "../components/forms/FieldIcon";
import "@shopify/polaris/build/esm/styles.css";

const CANVAS_DROP_ID = "tclf-canvas";
const AUTOSAVE_DELAY = 1500;

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const form = await getForm(session.shop, params.formId);
  if (!form) {
    throw new Response("Form not found", { status: 404 });
  }
  const counts = await getFormSubmissionCounts(session.shop);
  return { form: { ...form, submissionCount: counts[form.id] || 0 } };
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

function docFromForm(form) {
  return {
    name: form.name,
    schema: form.schema,
    desktopStyle: form.desktopStyle || DEFAULT_DESKTOP_STYLE,
    mobileStyle: form.mobileStyle || {},
  };
}

export default function FormBuilder() {
  const { form } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = docFromForm(form);

  const { doc, update, undo, redo, select, load, canUndo, canRedo, dirty, selectedFieldId } =
    useBuilderHistory(initialRef.current);

  const [panelTab, setPanelTab] = useState("field");
  const [canvasTab, setCanvasTab] = useState("build");
  const [viewport, setViewport] = useState("desktop");
  const activeStyle = viewport === "mobile" ? doc.mobileStyle : doc.desktopStyle;
  const [popupPreview, setPopupPreview] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [bannerError, setBannerError] = useState(null);

  const lastSavedRef = useRef(null);
  const prevFetcherState = useRef(fetcher.state);
  const uid = "canvas";

  const fields = useMemo(() => doc.schema?.fields || [], [doc.schema]);
  const selectedField = fields.find((field) => field.id === selectedFieldId) || null;
  const published = form.status === "PUBLISHED";

  // ─── Saving ────────────────────────────────────────────────────────────────

  const submitDoc = useCallback(
    (intent, nextDoc) => {
      const serialized = JSON.stringify(nextDoc);
      if (intent === "save") lastSavedRef.current = serialized;
      setSaveState("saving");
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
    if (!result.ok) {
      setSaveState("error");
      setBannerError(result.message);
      shopify.toast.show(result.message, { isError: true });
      return;
    }
    setBannerError(null);
    if (result.intent === "save") {
      setSaveState(dirty ? "saving" : "saved");
      setSavedAt(new Date());
    } else {
      setSaveState("saved");
      setSavedAt(new Date());
      shopify.toast.show(result.message);
    }
    // `dirty` is intentionally not a dependency: it changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data, shopify]);

  // A publish/unpublish revalidates the loader. Once the server's copy matches
  // what we sent, adopt it as the new undo baseline.
  const loaderStamp = `${form.id}:${form.status}:${new Date(form.updatedAt).getTime()}`;
  useEffect(() => {
    const incoming = docFromForm(form);
    if (lastSavedRef.current && JSON.stringify(incoming) === lastSavedRef.current) {
      lastSavedRef.current = null;
      load(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderStamp]);

  // ─── Drag and drop ─────────────────────────────────────────────────────────

  const sensors = useSensors(
    // A small activation distance keeps click-to-select working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event) => {
    const { active } = event;
    setActiveDrag({
      id: active.id,
      source: active.data.current?.source,
      fieldType: active.data.current?.fieldType || null,
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    if (active.data.current?.source === "palette") {
      const type = active.data.current.fieldType;
      const index =
        over.id === CANVAS_DROP_ID ? doc.schema.fields.length : doc.schema.fields.findIndex((f) => f.id === over.id);
      update((current) => addField(current, type, index));
      return;
    }

    if (active.id !== over.id && over.id !== CANVAS_DROP_ID) {
      update((current) => moveField(current, String(active.id), String(over.id)));
    }
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handlePaletteAdd = (type) => update((current) => addField(current, type, null));

  const handleSelectField = (fieldId) => {
    select(fieldId);
    setPanelTab("field");
  };

  const canvasCss = buildFormCss({ publicId: form.publicId, desktop: doc.desktopStyle, mobile: doc.mobileStyle });

  return (
    <Page
      title={form.name}
      titleMetadata={
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={published ? "success" : undefined}>{published ? "Published" : "Draft"}</Badge>
          <Text as="span" variant="bodySm" tone="subdued">
            {form.submissionCount.toLocaleString()} submissions
          </Text>
        </InlineStack>
      }
      backAction={{ content: "Forms", url: "/app/forms" }}
      primaryAction={{
        content: published ? "Unpublish" : "Publish",
        onAction: () => submitDoc(published ? "unpublish" : "publish", doc),
        loading: saveState === "saving",
      }}
      secondaryActions={[
        {
          content: "Save",
          icon: SaveIcon,
          onAction: () => submitDoc("save", doc),
          disabled: !dirty,
        },
        {
          content: "Undo",
          icon: UndoIcon,
          onAction: undo,
          disabled: !canUndo,
        },
        {
          content: "Redo",
          icon: RedoIcon,
          onAction: redo,
          disabled: !canRedo,
        },
      ]}
    >
      <BlockStack gap="300">
        {bannerError && (
          <Banner tone="critical" title="Couldn't save your changes" onDismiss={() => setBannerError(null)}>
            <p>{bannerError}</p>
          </Banner>
        )}

        <InlineStack gap="200" blockAlign="center">
          <TextField
            label="Form name"
            labelHidden
            value={doc.name}
            autoComplete="off"
            onChange={(name) => update((current) => ({ ...current, name }), "form-name")}
          />
          <SaveIndicator state={saveState} savedAt={savedAt} />
        </InlineStack>
      </BlockStack>

      <Divider />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr) 340px", gap: 12, alignItems: "stretch" }}>
          <Panel>
            <FieldPalette onAddField={handlePaletteAdd} />
          </Panel>

          <Panel>
            <Tabs
              tabs={[
                { id: "build", content: "Build" },
                { id: "preview", content: "Preview" },
              ]}
              selected={canvasTab}
              onSelect={setCanvasTab}
            >
              <Tabs.Panel id="build">
                <Canvas
                  formId={form.publicId}
                  css={canvasCss}
                  fields={fields}
                  uid={uid}
                  settings={doc.schema.settings}
                  desktopStyle={doc.desktopStyle}
                  selectedFieldId={selectedFieldId}
                  onSelectField={handleSelectField}
                  onDuplicate={(fieldId) => update((current) => duplicateField(current, fieldId))}
                  onRemove={(fieldId) => {
                    update((current) => removeField(current, fieldId));
                    if (fieldId === selectedFieldId) select(null);
                  }}
                />
              </Tabs.Panel>

              <Tabs.Panel id="preview">
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <ButtonGroup variant="segmented">
                      <Button
                        icon={DesktopIcon}
                        pressed={viewport === "desktop"}
                        onClick={() => setViewport("desktop")}
                        accessibilityLabel="Desktop preview"
                      >
                        Desktop
                      </Button>
                      <Button
                        icon={MobileIcon}
                        pressed={viewport === "mobile"}
                        onClick={() => setViewport("mobile")}
                        accessibilityLabel="Mobile preview"
                      >
                        Mobile
                      </Button>
                    </ButtonGroup>
                    <Checkbox
                      label="Show as popup"
                      checked={popupPreview}
                      onChange={setPopupPreview}
                    />
                  </InlineStack>

                  <div
                    style={{
                      background: "#f1f2f3",
                      padding: 12,
                      borderRadius: 8,
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: viewport === "mobile" ? 390 : "100%",
                        maxWidth: "100%",
                        transition: "width 0.2s ease",
                      }}
                    >
                      <FormPreview
                        publicId={`${form.publicId}-preview`}
                        schema={doc.schema}
                        desktopStyle={doc.desktopStyle}
                        mobileStyle={doc.mobileStyle}
                        viewport={viewport}
                        mode={popupPreview ? "popup" : "inline"}
                      />
                    </div>
                  </div>
                </BlockStack>
              </Tabs.Panel>
            </Tabs>
          </Panel>

          <Panel>
            <Tabs
              tabs={[
                { id: "field", content: "Field", disabled: !selectedField },
                { id: "form", content: "Form" },
                { id: "design", content: "Design" },
              ]}
              selected={panelTab}
              onSelect={setPanelTab}
            >
              <Tabs.Panel id="field">
                <FieldSettings
                  field={selectedField}
                  otherFields={fields.filter((field) => field.id !== selectedFieldId)}
                  onUpdate={(patch) => update((current) => updateField(current, selectedFieldId, patch), `field-${selectedFieldId}`)}
                  onUpdateSection={(section, patch) =>
                    update((current) => updateFieldSettings(current, selectedFieldId, section, patch))
                  }
                  onRemove={() => {
                    update((current) => removeField(current, selectedFieldId));
                    select(null);
                  }}
                  onDuplicate={() => update((current) => duplicateField(current, selectedFieldId))}
                />
              </Tabs.Panel>
              <Tabs.Panel id="form">
                <FormSettings
                  settings={doc.schema.settings}
                  updateSetting={(patch) => update((current) => setSchemaSettings(current, patch), "form-settings")}
                />
              </Tabs.Panel>
              <Tabs.Panel id="design">
                <BlockStack gap="200">
                  <ButtonGroup variant="segmented">
                    <Button pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>Desktop</Button>
                    <Button pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>Mobile</Button>
                  </ButtonGroup>
                  <DesignSettings
                    style={activeStyle}
                    viewport={viewport}
                    onChange={(patch) => update((current) => setStyle(current, viewport, patch), `style-${viewport}`)}
                  />
                </BlockStack>
              </Tabs.Panel>
            </Tabs>
          </Panel>
        </div>

        <DragOverlay>
          {activeDrag ? <DragOverlayCard drag={activeDrag} /> : null}
        </DragOverlay>
      </DndContext>
    </Page>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function Panel({ children }) {
  return (
    <div
      style={{
        border: "1px solid #e1e3e5",
        borderRadius: 12,
        background: "#ffffff",
        maxHeight: "calc(100vh - 320px)",
        overflow: "auto",
      }}
    >
      {children}
    </div>
  );
}

function SaveIndicator({ state, savedAt }) {
  if (state === "saving") {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        Saving…
      </Text>
    );
  }
  if (state === "error") {
    return (
      <Text as="span" variant="bodySm" tone="critical">
        Not saved
      </Text>
    );
  }
  if (savedAt) {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
    );
  }
  return (
    <Text as="span" variant="bodySm" tone="subdued">
      All changes saved
    </Text>
  );
}

// ─── Canvas ──────────────────────────────────────────────────────────────────

function Canvas({
  formId,
  css,
  fields,
  uid,
  settings,
  desktopStyle,
  selectedFieldId,
  onSelectField,
  onDuplicate,
  onRemove,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROP_ID });
  const hasInputFields = fields.some((field) => field.type !== "submitButton");

  return (
    <Box padding="400">
      <div className={`tclf-card tclf-form--${formId}`} style={{ position: "relative" }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div
          ref={setNodeRef}
          className="tclf-grid"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: 12,
            minHeight: 120,
            padding: isOver ? 8 : 0,
            borderRadius: 8,
            outline: isOver ? "2px dashed #2c6ecb" : "none",
            outlineOffset: 4,
            background: isOver ? "rgba(44, 110, 203, 0.04)" : "transparent",
            transition: "background 0.12s ease, padding 0.12s ease",
            textAlign: desktopStyle?.alignment || "left",
          }}
        >
          {!hasInputFields && (
            <div
              style={{
                flex: "1 1 100%",
                border: "2px dashed #c9cccf",
                borderRadius: 8,
                padding: "28px 16px",
                textAlign: "center",
                color: "#6d7175",
                background: "#fafbfb",
              }}
            >
              <Text as="p" variant="bodySm" tone="subdued">
                Drag a field here from the left, or click one to add it.
              </Text>
            </div>
          )}
          <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            {fields.map((field) => (
              <CanvasField
                key={field.id}
                field={field}
                uid={uid}
                submitText={settings?.submitText}
                buttonStyle={desktopStyle?.buttonStyle || "solid"}
                selected={selectedFieldId === field.id}
                onSelect={() => onSelectField(field.id)}
                onDuplicate={() => onDuplicate(field.id)}
                onRemove={() => onRemove(field.id)}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </Box>
  );
}

function CanvasField({ field, uid, submitText, buttonStyle, selected, onSelect, onDuplicate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { source: "canvas" },
  });
  const meta = getFieldType(field.type);

  const flex =
    field.width === "half"
      ? "1 1 calc(50% - 6px)"
      : field.width === "third"
        ? "1 1 calc(33.333% - 8px)"
        : "1 1 100%";

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        flex,
        minWidth: 0,
        position: "relative",
        padding: 8,
        borderRadius: 8,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        border: selected ? "2px solid #2c6ecb" : "1px dashed transparent",
        background: selected ? "#f1f7ff" : "transparent",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <FormFieldPreview
          field={field}
          uid={uid}
          submitText={submitText}
          buttonStyle={buttonStyle}
          bare
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: -10,
          right: 6,
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px",
          borderRadius: 6,
          background: "#ffffff",
          border: "1px solid #e1e3e5",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          opacity: selected || isDragging ? 1 : 0,
        }}
      >
        <Tooltip content={meta?.label || field.type}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px" }}>
            <FieldIcon name={meta?.icon} color="subdued" size={14} />
            <Text as="span" variant="bodySm" tone="subdued">
              {meta?.label || field.type}
            </Text>
          </span>
        </Tooltip>
        <Tooltip content="Drag to reorder">
          <button
            type="button"
            aria-label={`Reorder ${field.label}`}
            style={chromeButtonStyle}
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <DragHandleIcon size={14} />
          </button>
        </Tooltip>
        <Tooltip content="Duplicate">
          <button
            type="button"
            aria-label={`Duplicate ${field.label}`}
            style={chromeButtonStyle}
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
          >
            <DuplicateIcon size={14} />
          </button>
        </Tooltip>
        <Tooltip content="Delete">
          <button
            type="button"
            aria-label={`Delete ${field.label}`}
            style={chromeButtonStyle}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            disabled={field.type === "submitButton"}
          >
            ✕
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function DragOverlayCard({ drag }) {
  const meta = drag.fieldType ? getFieldType(drag.fieldType) : null;
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "#ffffff",
        border: "1px solid #2c6ecb",
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <FieldIcon name={meta?.icon} color="subdued" size={16} />
      <Text as="span" variant="bodySm" fontWeight="medium">
        {meta?.label || "Move field"}
      </Text>
    </div>
  );
}

const chromeButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  cursor: "pointer",
  color: "#6d7175",
  touchAction: "none",
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
