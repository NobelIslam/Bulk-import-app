import { BlockStack, Box, Button, Checkbox, Divider, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { getFieldType, WIDTH_LABELS } from "../../forms/fields";
import FieldIcon from "./FieldIcon";

const WIDTH_OPTIONS = Object.entries(WIDTH_LABELS).map(([value, label]) => ({ value, label }));

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

// Right panel: per-field settings for the field selected in the canvas.
export default function FieldSettings({ field, otherFields, onUpdate, onUpdateSection, onRemove, onDuplicate }) {
  if (!field) {
    return (
      <Box padding="400">
        <Text as="p" variant="bodySm" tone="subdued">
          Select a field on the canvas to edit its settings.
        </Text>
      </Box>
    );
  }

  const meta = getFieldType(field.type);
  const isLayout = meta?.submissionKey === false;
  const conditionalSource = otherFields.find((entry) => entry.id === field.conditional?.fieldId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, overflowY: "auto" }}>
      <InlineStack gap="200" align="center">
        <FieldIcon name={meta?.icon} color="subdued" size={18} />
        <Text as="h2" variant="headingSm">
          {meta?.label || field.type}
        </Text>
      </InlineStack>

      <BlockStack gap="300">
        <TextField
          label="Label"
          value={field.label}
          onChange={(label) => onUpdate({ label })}
          autoComplete="off"
        />

        {field.type !== "hiddenField" && (
          <TextField
            label="Placeholder"
            value={field.placeholder}
            onChange={(placeholder) => onUpdate({ placeholder })}
            autoComplete="off"
            disabled={["heading", "paragraph", "submitButton", "checkbox", "consentCheckbox", "radio", "multiCheckbox"].includes(field.type)}
          />
        )}

        <TextField
          label="Help text"
          value={field.helpText}
          onChange={(helpText) => onUpdate({ helpText })}
          autoComplete="off"
          multiline
          rows={2}
          showCharacterCount
          maxLength={300}
        />
      </BlockStack>

      {!isLayout && field.type !== "consentCheckbox" && (
        <Checkbox
          label="Required"
          checked={Boolean(field.required)}
          onChange={(required) => onUpdate({ required })}
        />
      )}

      {["checkbox", "radio", "dropdown", "multiCheckbox", "submitButton", "hiddenField", "date", "number"].includes(field.type) && (
        <TextField
          label="Default value"
          value={asString(field.defaultValue)}
          onChange={(defaultValue) => onUpdate({ defaultValue })}
          autoComplete="off"
        />
      )}

      {meta?.hasOptions && (
        <OptionsEditor field={field} onChange={(options) => onUpdate({ options })} />
      )}

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Layout
        </Text>
        <Select
          label="Column width"
          options={WIDTH_OPTIONS}
          value={field.width}
          onChange={(width) => onUpdate({ width })}
        />
      </BlockStack>

      {!isLayout && (
        <>
          <Divider />
          <ValidationEditor field={field} onChange={(patch) => onUpdateSection("validation", patch)} />
        </>
      )}

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Conditional visibility
        </Text>
        <Select
          label="Show this field when"
          options={[{ value: "", label: "Always visible" }].concat(
            otherFields.map((entry) => ({
              value: entry.id,
              label: `${getFieldType(entry.type)?.label || entry.type}: ${entry.label}`,
            })),
          )}
          value={field.conditional?.fieldId || ""}
          onChange={(fieldId) =>
            onUpdate({ conditional: fieldId ? { fieldId, equals: field.conditional?.equals || "" } : null })
          }
        />
        {field.conditional?.fieldId && (
          <>
            <TextField
              label={`Value${conditionalSource ? ` of “${conditionalSource.label}”` : ""}`}
              value={field.conditional.equals}
              onChange={(equals) => onUpdate({ conditional: { ...field.conditional, equals } })}
              autoComplete="off"
            />
            <Text as="p" variant="bodySm" tone="subdued">
              The field stays hidden until that value matches. Leave the value blank to show it as soon as the other
              field is answered.
            </Text>
          </>
        )}
      </BlockStack>

      <Divider />

      <InlineStack gap="200">
        <Button onClick={onDuplicate}>Duplicate</Button>
        <Button
          tone="critical"
          onClick={onRemove}
          disabled={field.type === "submitButton"}
        >
          Delete
        </Button>
      </InlineStack>
    </div>
  );
}

function OptionsEditor({ field, onChange }) {
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingMd">
        Options
      </Text>
      {field.options.map((option, index) => (
        <InlineStack key={`${field.id}-option-${index}`} gap="200" align="bottom">
          <Box width="100%">
            <TextField
              label={`Option ${index + 1}`}
              labelHidden
              value={option}
              autoComplete="off"
              onChange={(value) => {
                const next = [...field.options];
                next[index] = value;
                onChange(next);
              }}
            />
          </Box>
          <Button
            variant="tertiary"
            onClick={() => onChange(field.options.filter((_, entryIndex) => entryIndex !== index))}
          >
            Remove
          </Button>
        </InlineStack>
      ))}
      <Button onClick={() => onChange([...field.options, `Option ${field.options.length + 1}`])}>Add option</Button>
    </BlockStack>
  );
}

function ValidationEditor({ field, onChange }) {
  const validation = field.validation || {};
  const showLength = ["shortText", "longText", "password"].includes(field.type);
  const showNumber = field.type === "number";

  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        Validation
      </Text>
      {showNumber && (
        <InlineStack gap="200">
          <Box width="100%">
            <TextField
              label="Minimum"
              type="number"
              value={asNumberOrBlank(validation.min)}
              autoComplete="off"
              onChange={(value) => onChange({ min: value === "" ? null : Number(value) })}
            />
          </Box>
          <Box width="100%">
            <TextField
              label="Maximum"
              type="number"
              value={asNumberOrBlank(validation.max)}
              autoComplete="off"
              onChange={(value) => onChange({ max: value === "" ? null : Number(value) })}
            />
          </Box>
        </InlineStack>
      )}
      {showLength && (
        <InlineStack gap="200">
          <Box width="100%">
            <TextField
              label="Min length"
              type="number"
              value={asNumberOrBlank(validation.minLength)}
              autoComplete="off"
              onChange={(value) => onChange({ minLength: value === "" ? null : Number(value) })}
            />
          </Box>
          <Box width="100%">
            <TextField
              label="Max length"
              type="number"
              value={asNumberOrBlank(validation.maxLength)}
              autoComplete="off"
              onChange={(value) => onChange({ maxLength: value === "" ? null : Number(value) })}
            />
          </Box>
        </InlineStack>
      )}
      <TextField
        label="Pattern (regex)"
        value={validation.pattern || ""}
        autoComplete="off"
        onChange={(pattern) => onChange({ pattern })}
        helpText="Optional. Regular expression the value must match, for example ^[A-Z]{2}[0-9]{4}$."
      />
      {validation.pattern ? (
        <TextField
          label="Pattern error message"
          value={validation.patternMessage || ""}
          autoComplete="off"
          onChange={(patternMessage) => onChange({ patternMessage })}
        />
      ) : null}
    </BlockStack>
  );
}