import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BlockStack, Box, InlineStack, Text } from "@shopify/polaris";
import { FIELD_GROUPS, FIELD_TYPES } from "../../forms/fields";
import { DragHandleIcon } from "@shopify/polaris-icons";
import FieldIcon from "./FieldIcon";

// Left panel of the builder. Drag a field onto the canvas to place it, or click
// to append it — clicking keeps the builder usable without a pointer.
export default function FieldPalette({ onAddField }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, overflowY: "auto" }}>
      <Box>
        <Text as="h2" variant="headingSm">
          Add a field
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Drag onto the canvas, or click to add at the end.
        </Text>
      </Box>

      {FIELD_GROUPS.map((group) => (
        <BlockStack key={group.key} gap="100">
          <Text as="h3" variant="headingXs" tone="subdued">
            {group.title.toUpperCase()}
          </Text>
          <BlockStack gap="100">
            {FIELD_TYPES.filter((field) => field.group === group.key).map((field) => (
              <PaletteItem key={field.type} field={field} onAddField={onAddField} />
            ))}
          </BlockStack>
        </BlockStack>
      ))}
    </div>
  );
}

function PaletteItem({ field, onAddField }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${field.type}`,
    data: { source: "palette", fieldType: field.type },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 8px",
          border: "1px solid #e1e3e5",
          borderRadius: 8,
          background: "#ffffff",
        }}
      >
        <button
          type="button"
          aria-label={`Drag ${field.label} field`}
          {...listeners}
          {...attributes}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            border: 0,
            borderRadius: 5,
            background: "transparent",
            color: "#8a8a8a",
            cursor: "grab",
            touchAction: "none",
            padding: 0,
          }}
        >
          <DragHandleIcon width={16} height={16} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => onAddField(field.type)}
          aria-label={`Add ${field.label} field`}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            font: "inherit",
            padding: 0,
          }}
        >
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <FieldIcon name={field.icon} color="subdued" size={18} />
            <Text as="span" variant="bodySm" fontWeight="medium" truncate>
              {field.label}
            </Text>
          </InlineStack>
        </button>
      </div>
    </div>
  );
}