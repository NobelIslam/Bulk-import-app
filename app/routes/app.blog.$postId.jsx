import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { Banner, Button, ButtonGroup, Modal, Select, Tabs, TextField, Tooltip } from "@shopify/polaris";
import {
  ChevronRightIcon,
  DesktopIcon,
  DragDropIcon,
  DragHandleIcon,
  EditIcon,
  ExternalIcon,
  MobileIcon,
  RedoIcon,
  SettingsIcon,
  UndoIcon,
  ViewIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { getPost, listBlogs, publishPost, savePost, unpublishPost } from "../blog/blog.server";
import {
  columnPercents,
  columnsStyle,
  columnStyle,
  containerIdsWithin,
  defaultBlock,
  duplicateBlock,
  findBlock,
  getBlockType,
  getContainerBlocks,
  getLayoutPreset,
  insertBlock,
  moveBlock,
  normalizeDoc,
  pageStyle,
  removeBlock,
  renderDocHtml,
  renderLeaf,
  resizeColumnPair,
  ROOT,
  sectionInnerStyle,
  sectionStyle,
  slugifyHandle,
  updateBlock,
  wrapperStyle,
} from "../blog/blocks";
import { escapeHtml } from "../forms/content";
import useBuilderHistory from "../forms/builder-state";
import BlockPalette, { BlockIcon } from "../components/blog/BlockPalette";
import BlockSettings, { DesignPanel } from "../components/blog/BlockSettings";
import { ImagePicker } from "../components/forms/ContentControls";
import "@shopify/polaris/build/esm/styles.css";
import "../components/forms/builder.css";
import "../components/blog/blog-builder.css";

const TABS = [
  { id: "build", label: "Build" },
  { id: "design", label: "Design" },
  { id: "settings", label: "Post settings" },
];

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const post = await getPost(session.shop, params.postId);
  if (!post) throw new Response("Post not found", { status: 404 });
  const shopify = await listBlogs(admin).catch((error) => ({ blogs: [], shop: null, error: error.message }));
  return {
    post,
    blogs: shopify.blogs,
    blogsError: shopify.error || null,
    shopName: shopify.shop?.name || session.shop,
    storeUrl: shopify.shop?.primaryDomain?.url || `https://${session.shop}`,
  };
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  let doc = null;
  try {
    doc = JSON.parse(String(formData.get("doc") || "null"));
  } catch {
    doc = null;
  }

  try {
    if (intent === "save") {
      if (!doc) return { ok: false, intent, message: "Couldn't read the post. Reload and try again." };
      const saved = await savePost(session.shop, params.postId, doc);
      return saved ? { ok: true, intent, message: "Draft saved." } : { ok: false, intent, message: "Post not found." };
    }
    if (intent === "publish") {
      if (!doc) return { ok: false, intent, message: "Couldn't read the post. Reload and try again." };
      return { intent, ...(await publishPost(admin, session.shop, params.postId, doc, { publish: true })) };
    }
    if (intent === "unpublish") {
      return { intent, ...(await unpublishPost(admin, session.shop, params.postId)) };
    }
  } catch (error) {
    return { ok: false, intent, message: error.message || "Something went wrong talking to Shopify." };
  }
  return { ok: false, intent, message: "Unknown action." };
};

function docFromPost(post, blogs) {
  const doc = normalizeDoc(post.doc);
  if (!doc.post.blogId && blogs[0]) doc.post.blogId = blogs[0].id;
  return doc;
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// Droppables are only drop slots, so the one under the pointer wins; when the
// pointer is between targets the nearest slot is used.
function collisionDetection(args) {
  const within = pointerWithin(args);
  return within.length ? within : closestCenter(args);
}

// Keeps the floating drag card just below-right of the pointer, so it never
// covers the drop line or its "Release to place" label under the pointer.
function offsetFromCursor({ activatorEvent, draggingNodeRect, transform }) {
  const point = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!point || !draggingNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + point.x - draggingNodeRect.left + 18,
    y: transform.y + point.y - draggingNodeRect.top + 18,
  };
}

// Where a clicked palette item goes: after the selected element, inside a
// selected section, into a selected columns block's first column, or at the end.
function insertTarget(blocks, selectedId) {
  const found = selectedId ? findBlock(blocks, selectedId) : null;
  if (!found) return { containerId: ROOT, index: blocks.length };
  if (found.block.type === "section") return { containerId: found.block.id, index: found.block.props.children.length };
  if (found.block.type === "columns") {
    const first = found.block.props.columns[0];
    return { containerId: first.id, index: first.blocks.length };
  }
  return { containerId: found.containerId, index: found.index + 1 };
}

function parentBlockOf(blocks, id) {
  const found = findBlock(blocks, id);
  if (!found || found.containerId === ROOT) return null;
  let parent = null;
  const visit = (list) =>
    list.forEach((block) => {
      if (parent) return;
      if (block.type === "section") {
        if (block.id === found.containerId) parent = block;
        else visit(block.props.children);
      }
      if (block.type === "columns") {
        if (block.props.columns.some((col) => col.id === found.containerId)) parent = block;
        else block.props.columns.forEach((col) => visit(col.blocks));
      }
    });
  visit(blocks);
  return parent;
}

export default function BlogEditor() {
  const { post, blogs, blogsError, shopName, storeUrl } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = docFromPost(post, blogs);
  const { doc, update, undo, redo, select, markSaved, canUndo, canRedo, dirty, selectedFieldId: selectedId } =
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

  const published = post.status === "PUBLISHED";
  const liveUrl = published && post.blogHandle && post.articleHandle ? `${storeUrl}/blogs/${post.blogHandle}/${post.articleHandle}` : null;
  const selected = selectedId ? findBlock(doc.blocks, selectedId)?.block || null : null;

  // ─── Saving ────────────────────────────────────────────────────────────────

  const submitDoc = useCallback(
    (intent, nextDoc) => {
      if (intent === "publish" && !nextDoc.post.blogId) {
        setBannerError("Choose which blog to publish to in Post settings.");
        setTab("settings");
        return;
      }
      sentDocRef.current = intent === "unpublish" ? null : nextDoc;
      setSaveState("saving");
      setPendingIntent(intent);
      fetcher.submit({ intent, doc: JSON.stringify(nextDoc) }, { method: "post" });
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

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ─── Editing ───────────────────────────────────────────────────────────────

  const setBlocks = (fn, key) => update((current) => ({ ...current, blocks: fn(current.blocks) }), key);

  const createFromPalette = (kind, key) => (kind === "layout" ? getLayoutPreset(key)?.build() : defaultBlock(key));

  const addAt = (kind, key, containerId, index) => {
    const block = createFromPalette(kind, key);
    if (!block) return;
    setBlocks((blocks) => insertBlock(blocks, containerId, index, block));
    select(block.id);
    setTab("build");
  };

  const addFromClick = (kind, key) => {
    const target = insertTarget(doc.blocks, selectedId);
    addAt(kind, key, target.containerId, target.index);
  };

  const removeSelected = (id = selectedId) => {
    if (!id) return;
    setBlocks((blocks) => removeBlock(blocks, id));
    select(null);
  };

  const duplicateSelected = (id = selectedId) => {
    if (!id) return;
    const { copy } = duplicateBlock(doc.blocks, id);
    if (!copy) return;
    setBlocks((blocks) => {
      const found = findBlock(blocks, id);
      return found ? insertBlock(blocks, found.containerId, found.index + 1, copy) : blocks;
    });
    select(copy.id);
  };

  const moveSelected = (direction) => {
    const found = findBlock(doc.blocks, selectedId);
    if (!found) return;
    const list = getContainerBlocks(doc.blocks, found.containerId);
    const target = direction < 0 ? found.index - 1 : found.index + 2;
    if (target < 0 || target > list.length) return;
    setBlocks((blocks) => moveBlock(blocks, selectedId, found.containerId, target));
  };

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  const keysRef = useRef(null);
  keysRef.current = (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (dirty) submitDoc("save", doc);
      return;
    }
    if (isEditableTarget(event.target) || previewOpen) return;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && key === "y") {
      event.preventDefault();
      redo();
    } else if (mod && key === "d" && selectedId) {
      event.preventDefault();
      duplicateSelected();
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      removeSelected();
    } else if (event.key === "Escape" && selectedId) {
      select(null);
    }
  };
  useEffect(() => {
    const handler = (event) => keysRef.current?.(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Drag and drop ─────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = ({ active }) => {
    const data = active.data.current || {};
    if (data.source === "canvas") {
      const found = findBlock(doc.blocks, data.id);
      setActiveDrag({
        ...data,
        containerId: found?.containerId,
        index: found?.index,
        blocked: found ? containerIdsWithin(found.block) : new Set(),
      });
    } else {
      setActiveDrag({ ...data, blocked: new Set() });
    }
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null);
    const target = over?.data.current;
    if (!target) return;
    const data = active.data.current || {};
    if (data.source === "palette") {
      addAt(data.kind, data.key, target.containerId, target.index);
    } else if (data.source === "canvas") {
      setBlocks((blocks) => moveBlock(blocks, data.id, target.containerId, target.index));
      select(data.id);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const parent = selected ? parentBlockOf(doc.blocks, selected.id) : null;
  const showPanel = tab !== "settings";
  const canvasCtx = useMemo(
    () => ({
      design: doc.design,
      selectedId,
      drag: activeDrag,
      onUpdateBlock: (id, updater, key) => update((current) => ({ ...current, blocks: updateBlock(current.blocks, id, updater) }), key),
      onSelect: (id) => {
        select(id);
        setTab((current) => (current === "settings" ? "build" : current));
      },
    }),
    [doc.design, selectedId, activeDrag, select, update],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className={`fb-root${showPanel ? "" : " fb-root--no-panel"}`}>
        <BlockPalette onAdd={addFromClick} />

        <main className="fb-main">
          <nav className="fb-breadcrumb" aria-label="Breadcrumb">
            <Link to="/app/blog">Blog Editor</Link>
            <ChevronRightIcon width={16} height={16} fill="currentColor" aria-hidden="true" />
            <span className="fb-breadcrumb__current">{doc.post.title}</span>
          </nav>

          <header className="fb-header">
            <div className="fb-header__title">
              <EditableTitle
                value={doc.post.title}
                onChange={(title) => update((current) => ({ ...current, post: { ...current.post, title } }), "post-title")}
              />
              <span className={`fb-badge${published ? " fb-badge--success" : ""}`}>{published ? "Published" : "Draft"}</span>
            </div>
            <div className="fb-header__actions">
              <SaveIndicator state={saveState} savedAt={savedAt} dirty={dirty} />
              <Tooltip content="Undo (Ctrl+Z)">
                <Button icon={UndoIcon} variant="tertiary" accessibilityLabel="Undo" onClick={undo} disabled={!canUndo} />
              </Tooltip>
              <Tooltip content="Redo (Ctrl+Shift+Z)">
                <Button icon={RedoIcon} variant="tertiary" accessibilityLabel="Redo" onClick={redo} disabled={!canRedo} />
              </Tooltip>
              {liveUrl && (
                <Tooltip content="View on your store">
                  <Button icon={ExternalIcon} variant="tertiary" accessibilityLabel="View on store" url={liveUrl} target="_blank" />
                </Tooltip>
              )}
              <Button icon={ViewIcon} onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
              <Button
                onClick={() => submitDoc("save", doc)}
                disabled={!dirty || (pendingIntent !== null && pendingIntent !== "save")}
                loading={pendingIntent === "save"}
              >
                Save draft
              </Button>
              {published && (
                <Button onClick={() => submitDoc("unpublish", doc)} disabled={pendingIntent !== null && pendingIntent !== "unpublish"} loading={pendingIntent === "unpublish"}>
                  Unpublish
                </Button>
              )}
              <Button
                variant="primary"
                tone="success"
                onClick={() => submitDoc("publish", doc)}
                disabled={(published && !dirty) || (pendingIntent !== null && pendingIntent !== "publish")}
                loading={pendingIntent === "publish"}
              >
                {published ? "Update post" : "Publish"}
              </Button>
            </div>
          </header>

          {(bannerError || blogsError) && (
            <div style={{ marginBottom: 16 }}>
              <Banner
                tone="critical"
                title={bannerError ? "That didn't work" : "Couldn't load your blogs"}
                onDismiss={bannerError ? () => setBannerError(null) : undefined}
              >
                <p>{bannerError || blogsError}</p>
              </Banner>
            </div>
          )}

          <div className="fb-tabs">
            <Tabs
              tabs={TABS.map((entry) => ({ id: `bb-tab-${entry.id}`, content: entry.label, panelID: `bb-panel-${entry.id}` }))}
              selected={Math.max(TABS.findIndex((entry) => entry.id === tab), 0)}
              onSelect={(index) => setTab(TABS[index].id)}
            />
          </div>

          <div role="tabpanel" id={`bb-panel-${tab}`}>
            {tab === "settings" ? (
              <PostSettings
                post={doc.post}
                blogs={blogs}
                shopName={shopName}
                storeUrl={storeUrl}
                onError={(message) => shopify.toast.show(message, { isError: true })}
                onChange={(patch, key) => update((current) => ({ ...current, post: { ...current.post, ...patch } }), `post-${key || Object.keys(patch).join("-")}`)}
              />
            ) : (
              <>
                {activeDrag ? (
                  <div className="bb-dragbar" role="status">
                    <DragDropIcon width={20} height={20} fill="currentColor" aria-hidden="true" />
                    Drop “{activeDrag.label}” on a blue line or a dashed box. Release anywhere else to cancel.
                  </div>
                ) : (
                  tab === "build" && <Guide />
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <ButtonGroup variant="segmented">
                    <Button icon={DesktopIcon} pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>
                      Desktop
                    </Button>
                    <Button icon={MobileIcon} pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>
                      Mobile
                    </Button>
                  </ButtonGroup>
                </div>
                {/* Clicking empty canvas space clears the selection. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className={`bb-stage${viewport === "mobile" ? " bb-stage--mobile" : ""}`} onClick={() => select(null)}>
                  <div
                    className="bb-title-preview"
                    style={{ "--bb-width": doc.design.contentWidth ? `${Math.min(doc.design.contentWidth, viewport === "mobile" ? 390 : 9999)}px` : "100%" }}
                  >
                    {doc.post.title}
                  </div>
                  <div className="bb-page" style={pageStyle(doc.design)}>
                    <BlockList containerId={ROOT} blocks={doc.blocks} ctx={canvasCtx} root />
                  </div>
                </div>
              </>
            )}
          </div>
        </main>

        {showPanel && (
          <aside className="fb-panel" aria-label="Settings panel">
            {tab === "design" ? (
              <>
                <div className="fb-panel__header">
                  <h2 className="fb-panel__title">Post design</h2>
                </div>
                <p className="fb-help" style={{ marginBottom: 8 }}>
                  These apply to the whole post. Elements can override colors and alignment in their own settings.
                </p>
                <DesignPanel
                  design={doc.design}
                  onChange={(patch) => update((current) => ({ ...current, design: { ...current.design, ...patch } }), `design-${Object.keys(patch).join("-")}`)}
                />
              </>
            ) : selected ? (
              <BlockSettings
                key={selected.id}
                block={selected}
                parentLabel={parent ? getBlockType(parent.type).label.toLowerCase() : null}
                onSelectParent={() => parent && select(parent.id)}
                onUpdate={(updater, key) => setBlocks((blocks) => updateBlock(blocks, selected.id, updater), key)}
                onMove={moveSelected}
                onDuplicate={() => duplicateSelected()}
                onRemove={() => removeSelected()}
                onClose={() => select(null)}
                onError={(message) => shopify.toast.show(message, { isError: true })}
              />
            ) : (
              <>
                <div className="fb-panel__header">
                  <h2 className="fb-panel__title">Element settings</h2>
                </div>
                <div className="fb-panel__empty">
                  <SettingsIcon width={28} height={28} fill="#8a8a8a" aria-hidden="true" />
                  <strong style={{ color: "#303030" }}>Nothing selected</strong>
                  <span>Click any element on the page to change its text, colors, spacing and layout.</span>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <DragOverlay dropAnimation={null} modifiers={[offsetFromCursor]}>
        {activeDrag ? (
          <div className="fb-dragcard">
            <BlockIcon name={activeDrag.icon} />
            {activeDrag.label}
          </div>
        ) : null}
      </DragOverlay>

      <PreviewModal open={previewOpen} doc={doc} onClose={() => setPreviewOpen(false)} />

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        primaryAction={{ content: "Leave without saving", destructive: true, onAction: () => blocker.proceed?.() }}
        secondaryActions={[{ content: "Stay on this page", onAction: () => blocker.reset?.() }]}
      >
        <Modal.Section>
          <p>You have unsaved changes to this post. If you leave now, they&apos;ll be lost.</p>
        </Modal.Section>
      </Modal>
    </DndContext>
  );
}

// ─── Canvas ──────────────────────────────────────────────────────────────────
// Containers render the same inline styles as the published HTML, with drop
// slots between their children while something is being dragged.

function slotBlocked(drag, containerId, index) {
  if (!drag) return true;
  if (drag.blocked.has(containerId)) return true;
  // Dropping right before or after itself would change nothing.
  if (drag.source === "canvas" && drag.containerId === containerId && (index === drag.index || index === drag.index + 1)) return true;
  return false;
}

function Slot({ containerId, index, ctx }) {
  const disabled = slotBlocked(ctx.drag, containerId, index);
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${containerId}:${index}`, disabled, data: { containerId, index } });
  if (disabled) return null;
  return (
    <div ref={setNodeRef} className={`bb-slot${isOver ? " bb-slot--over" : ""}`} aria-hidden="true">
      <span>Release to place “{ctx.drag.label}” here</span>
    </div>
  );
}

function EmptyZone({ containerId, ctx, root, inColumn }) {
  const blocked = ctx.drag ? ctx.drag.blocked.has(containerId) : true;
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${containerId}:0`, disabled: blocked, data: { containerId, index: 0 } });
  const active = Boolean(ctx.drag) && !blocked;
  return (
    <div ref={setNodeRef} className={`bb-empty${root ? " bb-empty--root" : ""}${active ? " bb-empty--active" : ""}${isOver ? " bb-empty--over" : ""}`}>
      <DragDropIcon width={root ? 32 : 22} height={root ? 32 : 22} fill="currentColor" aria-hidden="true" />
      {isOver ? (
        <strong>Release to place “{ctx.drag.label}” here</strong>
      ) : root ? (
        <>
          <strong>Start building your post</strong>
          <span>Drag an element from the left and drop it here, or just click one to add it.</span>
          <span>Tip: start with a ready-made layout, or a Section or Columns to arrange things side by side.</span>
        </>
      ) : (
        <>
          <strong>{inColumn ? "Empty column" : "Empty section"}</strong>
          <span>Drop elements here</span>
        </>
      )}
    </div>
  );
}

function BlockList({ containerId, blocks, ctx, root = false, inColumn = false }) {
  if (blocks.length === 0) return <EmptyZone containerId={containerId} ctx={ctx} root={root} inColumn={inColumn} />;
  return (
    <>
      {blocks.map((block, index) => (
        <BlockSlotPair key={block.id} block={block} index={index} containerId={containerId} ctx={ctx} />
      ))}
      <Slot containerId={containerId} index={blocks.length} ctx={ctx} />
    </>
  );
}

function BlockSlotPair({ block, index, containerId, ctx }) {
  return (
    <>
      <Slot containerId={containerId} index={index} ctx={ctx} />
      <BlockView block={block} ctx={ctx} />
    </>
  );
}

function BlockView({ block, ctx }) {
  const meta = getBlockType(block.type);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { source: "canvas", id: block.id, label: meta.label, icon: meta.icon },
  });
  const selected = ctx.selectedId === block.id;

  let content;
  if (block.type === "section") {
    content = (
      <div style={sectionStyle(block)}>
        <div style={sectionInnerStyle(block, ctx.design)}>
          <BlockList containerId={block.id} blocks={block.props.children} ctx={ctx} />
        </div>
      </div>
    );
  } else if (block.type === "columns") {
    const percents = columnPercents(block);
    content = (
      <div style={columnsStyle(block)}>
        {block.props.columns.map((col, index) => (
          <div key={col.id} className="bb-col" style={{ ...columnStyle(col, ctx.design, block), position: "relative" }}>
            <BlockList containerId={col.id} blocks={col.blocks} ctx={ctx} inColumn />
            {index < block.props.columns.length - 1 && !ctx.drag && (
              <ColumnResizer
                block={block}
                index={index}
                percent={percents[index]}
                pairPercent={percents[index] + percents[index + 1]}
                gap={block.props.gap}
                onResize={(fraction) => ctx.onUpdateBlock(block.id, (current) => resizeColumnPair(current, index, fraction), `resize-${block.id}-${index}`)}
                onSelect={() => ctx.onSelect(block.id)}
              />
            )}
          </div>
        ))}
      </div>
    );
  } else {
    const html = renderLeaf(block, ctx.design, { editor: true });
    content = html ? (
      <div style={wrapperStyle(block)} dangerouslySetInnerHTML={{ __html: html }} />
    ) : (
      <div style={wrapperStyle(block)}>
        <div className="bb-empty" style={{ minHeight: 48 }}>
          <span>Empty {meta.label.toLowerCase()}: add content in the settings panel</span>
        </div>
      </div>
    );
  }

  return (
    // Mouse shortcut for selecting; keyboard users select through the grip button.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={setNodeRef}
      className={`bb-block${meta.container ? " bb-block--container" : ""}${selected ? " bb-block--selected" : ""}${isDragging ? " bb-block--dragging" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        ctx.onSelect(block.id);
      }}
    >
      <div className="bb-block__tag">
        <button
          type="button"
          className="bb-block__grip"
          aria-label={`${meta.label}: drag to move, or press Enter to select`}
          title="Drag to move"
          {...attributes}
          {...listeners}
          onClick={(event) => {
            event.stopPropagation();
            ctx.onSelect(block.id);
          }}
        >
          <DragHandleIcon width={14} height={14} fill="currentColor" />
          {meta.label}
        </button>
      </div>
      {content}
    </div>
  );
}

// Drag handle on the edge between two columns. It measures the pair on the
// page and turns the pointer position into the left column's share.
function ColumnResizer({ index, percent, pairPercent, gap, onResize, onSelect }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);

  const start = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const left = ref.current?.parentElement;
    const right = left?.nextElementSibling;
    if (!left || !right) return;
    // Stacked columns (one under the other) can't be resized sideways.
    if (Math.abs(left.getBoundingClientRect().top - right.getBoundingClientRect().top) > 4) return;
    onSelect();
    setDragging(true);
    const move = (moveEvent) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      const span = b.right - a.left - gap;
      if (span <= 0) return;
      onResize((moveEvent.clientX - a.left - gap / 2) / span);
    };
    const stop = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  // Arrow keys move the edge 2% at a time (Shift: 10%).
  const nudge = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.shiftKey ? 10 : 2) * (event.key === "ArrowLeft" ? -1 : 1);
    onResize((percent + step) / pairPercent);
  };

  return (
    // A focusable window splitter: drag with the pointer, or Tab to it and use arrow keys.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex
    <div
      ref={ref}
      className={`bb-resizer${dragging ? " bb-resizer--active" : ""}`}
      style={{ right: -(gap / 2) - 8 }}
      role="separator"
      // A focusable separator is the ARIA window-splitter pattern.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={5}
      aria-valuemax={95}
      aria-label={`Resize column ${index + 1} (arrow keys)`}
      title="Drag to resize columns"
      onPointerDown={start}
      onKeyDown={nudge}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="bb-resizer__grip" />
      {dragging && <span className="bb-resizer__label">{Math.round(percent)}%</span>}
    </div>
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
    if (next && next !== value) onChange(next.slice(0, 255));
    setEditing(false);
  };
  if (editing) {
    return (
      <input
        ref={inputRef}
        className="fb-title-input"
        value={draft}
        maxLength={255}
        aria-label="Post title"
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
      <Tooltip content="Rename post">
        <Button
          icon={EditIcon}
          variant="tertiary"
          accessibilityLabel="Rename post"
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
  if (savedAt) return <span className="fb-save-state">Saved {savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
  return <span className="fb-save-state">All changes saved</span>;
}

function Guide() {
  const steps = [
    ["Drag or click", "Pick an element or ready-made layout on the left."],
    ["Drop on a blue line", "Lines appear between elements while you drag. Dashed boxes are empty spots."],
    ["Click to customize", "Select anything on the page to edit it on the right, then Publish."],
  ];
  return (
    <div className="bb-guide">
      {steps.map(([title, text], index) => (
        <div key={title} className="bb-guide__step">
          <span className="bb-guide__num">{index + 1}</span>
          <div>
            <strong>{title}</strong>
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Post settings ───────────────────────────────────────────────────────────

function PostSettings({ post, blogs, shopName, storeUrl, onChange, onError }) {
  const blog = blogs.find((entry) => entry.id === post.blogId);
  const handle = post.handle || slugifyHandle(post.title);
  const seoTitle = post.seoTitle || post.title;
  const seoDescription = post.seoDescription || post.summary;
  return (
    <div className="bb-settings">
      <div className="fb-card">
        <h2 className="fb-publish-title">Basics</h2>
        <div className="fb-panel__stack">
          <TextField label="Title" value={post.title} autoComplete="off" maxLength={255} onChange={(title) => onChange({ title })} />
          <Select
            label="Blog"
            options={blogs.length ? blogs.map((entry) => ({ label: entry.title, value: entry.id })) : [{ label: "No blogs in this store", value: "" }]}
            value={post.blogId}
            disabled={!blogs.length}
            helpText={blogs.length ? "The blog this post is published to." : "Create a blog in Online Store → Blog posts first."}
            onChange={(blogId) => onChange({ blogId })}
          />
          <TextField label="Author" value={post.author} autoComplete="off" placeholder={shopName} onChange={(author) => onChange({ author })} />
          <TextField
            label="Tags"
            value={post.tags}
            autoComplete="off"
            placeholder="news, how-to, summer"
            helpText="Separate tags with commas."
            onChange={(tags) => onChange({ tags })}
          />
        </div>
      </div>

      <div className="fb-card">
        <h2 className="fb-publish-title">Featured image and excerpt</h2>
        <div className="fb-panel__stack">
          <ImagePicker label="Featured image" value={post.image} onChange={(image) => onChange({ image })} onError={onError} />
          {post.image && <TextField label="Image alt text" value={post.imageAlt} autoComplete="off" onChange={(imageAlt) => onChange({ imageAlt })} />}
          <TextField
            label="Excerpt"
            value={post.summary}
            multiline={3}
            maxLength={1000}
            showCharacterCount
            autoComplete="off"
            helpText="Shown on your blog page and in search results when no SEO description is set."
            onChange={(summary) => onChange({ summary })}
          />
        </div>
      </div>

      <div className="fb-card">
        <h2 className="fb-publish-title">Search engine listing</h2>
        <div className="fb-panel__stack">
          <div className="bb-serp" aria-label="Search result preview">
            <div className="bb-serp__url">{`${storeUrl.replace(/^https?:\/\//, "")} › blogs › ${blog?.handle || "news"} › ${handle || "post"}`}</div>
            <div className="bb-serp__title">{seoTitle.slice(0, 70)}</div>
            <div className="bb-serp__desc">{seoDescription ? seoDescription.slice(0, 160) : "Add an excerpt or SEO description to control this text."}</div>
          </div>
          <TextField label="Page title" value={post.seoTitle} autoComplete="off" maxLength={70} showCharacterCount placeholder={post.title} onChange={(seoTitle) => onChange({ seoTitle })} />
          <TextField
            label="Meta description"
            value={post.seoDescription}
            multiline={2}
            maxLength={320}
            showCharacterCount
            autoComplete="off"
            placeholder={post.summary || ""}
            onChange={(seoDescription) => onChange({ seoDescription })}
          />
          <TextField
            label="URL handle"
            value={post.handle}
            autoComplete="off"
            placeholder={slugifyHandle(post.title)}
            prefix={`/blogs/${blog?.handle || "…"}/`}
            helpText="Leave blank to use the title. Changing it later redirects the old address."
            onChange={(value) => onChange({ handle: slugifyHandle(value) }, "handle")}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Preview ─────────────────────────────────────────────────────────────────

// Renders exactly the HTML that publishing sends, in an isolated frame.
function PreviewModal({ open, doc, onClose }) {
  const [viewport, setViewport] = useState("desktop");
  const html = useMemo(() => {
    if (!open) return "";
    const normalized = normalizeDoc(doc);
    const width = normalized.design.contentWidth ? `${normalized.design.contentWidth}px` : "100%";
    const featured = normalized.post.image
      ? `<img src="${escapeHtml(normalized.post.image)}" alt="${escapeHtml(normalized.post.imageAlt)}" style="display:block;width:100%;max-width:${width};margin:0 auto 32px;border-radius:8px">`
      : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#222;background:#fff}
      .title{max-width:${width};margin:0 auto 24px;font-size:36px;line-height:1.2}
      img{max-width:100%}
    </style></head><body><h1 class="title">${escapeHtml(normalized.post.title)}</h1>${featured}${renderDocHtml(normalized)}</body></html>`;
  }, [open, doc]);

  return (
    <Modal open={open} onClose={onClose} title="Preview" size="large">
      <Modal.Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span className="fb-help" style={{ margin: 0 }}>
            This is the exact HTML your blog post receives. Your theme adds its own header, fonts and spacing around it.
          </span>
          <ButtonGroup variant="segmented">
            <Button icon={DesktopIcon} pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>
              Desktop
            </Button>
            <Button icon={MobileIcon} pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>
              Mobile
            </Button>
          </ButtonGroup>
        </div>
        <iframe
          title="Post preview"
          className={`bb-preview-frame${viewport === "mobile" ? " bb-preview-frame--mobile" : ""}`}
          sandbox="allow-scripts allow-popups allow-presentation"
          srcDoc={html}
        />
      </Modal.Section>
    </Modal>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
