import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  ButtonIcon,
  CodeIcon,
  DragHandleIcon,
  ImageIcon,
  ImageWithTextOverlayIcon,
  LayoutColumns2Icon,
  LayoutColumns3Icon,
  LayoutHeaderIcon,
  LayoutRows2Icon,
  LayoutSectionIcon,
  ListBulletedIcon,
  MegaphoneIcon,
  MinusIcon,
  PlayCircleIcon,
  SearchIcon,
  TextBlockIcon,
  TextInColumnsIcon,
  TextQuoteIcon,
  TextTitleIcon,
} from "@shopify/polaris-icons";
import { BLOCK_GROUPS, BLOCK_TYPES, LAYOUT_PRESETS } from "../../blog/blocks";

const ICONS = {
  section: LayoutSectionIcon,
  columns: LayoutColumns2Icon,
  heading: TextTitleIcon,
  text: TextBlockIcon,
  image: ImageIcon,
  button: ButtonIcon,
  video: PlayCircleIcon,
  quote: TextQuoteIcon,
  list: ListBulletedIcon,
  divider: MinusIcon,
  spacer: LayoutRows2Icon,
  code: CodeIcon,
  hero: LayoutHeaderIcon,
  imageText: ImageWithTextOverlayIcon,
  textImage: TextInColumnsIcon,
  features: LayoutColumns3Icon,
  cta: MegaphoneIcon,
  gallery: ImageIcon,
};

export function BlockIcon({ name, size = 20, color = "#303030" }) {
  const Icon = ICONS[name] || TextBlockIcon;
  return <Icon width={size} height={size} fill={color} aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0 }} />;
}

// Left sidebar: elements and ready-made layouts. Drag one onto a blue drop
// line in the canvas, or click it to add it after the selected element.
export default function BlockPalette({ onAdd }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const match = (label, description) => !term || label.toLowerCase().includes(term) || description.toLowerCase().includes(term);

  const groups = BLOCK_GROUPS.map((group) => ({
    ...group,
    items: BLOCK_TYPES.filter((entry) => entry.group === group.key && match(entry.label, entry.description)).map((entry) => ({
      id: `palette-block-${entry.type}`,
      kind: "block",
      key: entry.type,
      label: entry.label,
      description: entry.description,
      icon: entry.icon,
    })),
  }));
  groups.push({
    key: "presets",
    title: "Ready-made layouts",
    hint: "Pre-arranged groups you can edit",
    items: LAYOUT_PRESETS.filter((preset) => match(preset.label, preset.description)).map((preset) => ({
      id: `palette-layout-${preset.key}`,
      kind: "layout",
      key: preset.key,
      label: preset.label,
      description: preset.description,
      icon: preset.key,
    })),
  });
  const visible = groups.filter((group) => group.items.length);

  return (
    <aside className="fb-sidebar" aria-label="Elements">
      <h2 className="fb-sidebar__title">Elements</h2>
      <div className="fb-search">
        <SearchIcon width={18} height={18} fill="#616161" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search elements…"
          aria-label="Search elements"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {visible.length === 0 && <p className="fb-sidebar__empty">Nothing matches “{query}”.</p>}
      {visible.map((group) => (
        <section key={group.key} className="fb-group">
          <h3 className="fb-group__title">{group.title}</h3>
          {group.hint && <p className="bb-group-hint">{group.hint}</p>}
          <div className="fb-group__list">
            {group.items.map((item) => (
              <PaletteItem key={item.id} item={item} onAdd={onAdd} />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}

function PaletteItem({ item, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { source: "palette", kind: item.kind, key: item.key, label: item.label, icon: item.icon },
  });
  return (
    <div
      ref={setNodeRef}
      className={`fb-element${isDragging ? " fb-element--dragging" : ""}`}
      title={item.description}
      onPointerDown={listeners?.onPointerDown}
    >
      <button type="button" className="fb-element__add" onClick={() => onAdd(item.kind, item.key)} aria-label={`Add ${item.label}`}>
        <BlockIcon name={item.icon} />
        <span className="fb-element__label">{item.label}</span>
      </button>
      <button type="button" className="fb-element__handle" aria-label={`Drag ${item.label} onto the page`} {...attributes} {...listeners}>
        <DragHandleIcon width={18} height={18} fill="currentColor" />
      </button>
    </div>
  );
}
