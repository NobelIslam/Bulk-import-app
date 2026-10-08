import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { DragHandleIcon, SearchIcon } from "@shopify/polaris-icons";
import { FIELD_GROUPS, FIELD_TYPES } from "../../forms/fields";
import FieldIcon from "./FieldIcon";

// Left sidebar. Click an element to append it above the submit button, or drag
// it onto the canvas to place it exactly.
export default function FieldPalette({ onAddField, disabledTypes = {} }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = (field) =>
    !term || field.label.toLowerCase().includes(term) || field.description.toLowerCase().includes(term);

  const groups = FIELD_GROUPS.map((group) => ({
    ...group,
    fields: FIELD_TYPES.filter((field) => field.group === group.key && matches(field)),
  })).filter((group) => group.fields.length > 0);

  return (
    <aside className="fb-sidebar" aria-label="Form elements">
      <h2 className="fb-sidebar__title">Form elements</h2>
      <div className="fb-search">
        <SearchIcon width={18} height={18} fill="#616161" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search components…"
          aria-label="Search components"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {groups.length === 0 && <p className="fb-sidebar__empty">No elements match “{query}”.</p>}

      {groups.map((group) => (
        <section key={group.key} className="fb-group">
          <h3 className="fb-group__title">{group.title}</h3>
          <div className="fb-group__list">
            {group.fields.map((field) => (
              <PaletteItem
                key={field.type}
                field={field}
                disabledReason={disabledTypes[field.type]}
                onAddField={onAddField}
              />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}

function PaletteItem({ field, disabledReason, onAddField }) {
  const disabled = Boolean(disabledReason);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${field.type}`,
    data: { source: "palette", fieldType: field.type },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`fb-element${isDragging ? " fb-element--dragging" : ""}${disabled ? " fb-element--disabled" : ""}`}
      title={disabledReason || field.description}
      // Pointer drags start anywhere on the row; keyboard drags use the handle.
      onPointerDown={disabled ? undefined : listeners?.onPointerDown}
    >
      <button
        type="button"
        className="fb-element__add"
        onClick={() => onAddField(field.type)}
        disabled={disabled}
        aria-label={disabled ? `${field.label}: ${disabledReason}` : `Add ${field.label}`}
      >
        <FieldIcon name={field.icon} size={20} />
        <span className="fb-element__label">{field.label}</span>
      </button>
      <button
        type="button"
        className="fb-element__handle"
        aria-label={`Drag ${field.label} onto the form`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon width={18} height={18} fill="currentColor" />
      </button>
    </div>
  );
}
