import { useState } from "react";
import { Button, RangeSlider, Select, TextField } from "@shopify/polaris";
import { ChevronDownIcon, ChevronRightIcon, DeleteIcon, PlusIcon, XIcon } from "@shopify/polaris-icons";
import {
  getFieldType,
  PATTERN_FIELD_TYPES,
  presetForValidation,
  RICH_TEXT_TYPES,
  SPACING_SIDES,
  STYLED_BLOCK_TYPES,
  VALIDATION_PRESETS,
  WIDTH_OPTIONS,
} from "../../forms/fields";
import { DATE_FORMATS, richTextToPlain } from "../../forms/content";
import FieldIcon from "./FieldIcon";
import { AlignmentPicker, ColorField, ImagePicker, RichTextEditor } from "./ContentControls";

const NO_PLACEHOLDER = ["heading", "paragraph", "divider", "submitButton", "checkbox", "consentCheckbox", "radio", "multiCheckbox", "hiddenField", "fileUpload", "image"];
const NO_LABEL = ["divider", "image", ...RICH_TEXT_TYPES];
const LABEL_IS_TEXT = { heading: "Heading text", paragraph: "Paragraph text", submitButton: "Button text" };
const DEFAULT_VALUE_TYPES = ["shortText", "longText", "email", "phone", "number", "date", "dropdown", "radio", "hiddenField"];
const LENGTH_TYPES = ["shortText", "longText"];

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <div className="fb-switch-row">
      <button
        type="button"
        role="switch"
        className="fb-switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
      <div>
        <div className="fb-switch-row__label">{label}</div>
        {description && <p className="fb-help" style={{ marginTop: 2 }}>{description}</p>}
      </div>
    </div>
  );
}

export function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <div className="fb-section">
      <button type="button" className="fb-section__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron width={18} height={18} fill="currentColor" aria-hidden="true" />
        {title}
      </button>
      {open && <div className="fb-section__body">{children}</div>}
    </div>
  );
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Right panel: settings for the field selected on the canvas.
export default function FieldSettings({
  field,
  otherFields,
  onUpdate,
  onUpdateSection,
  onRemove,
  onDuplicate,
  onClose,
  onError,
  twoColumn = false,
}) {
  const meta = getFieldType(field.type);
  const isLayout = meta?.submissionKey === false;
  const isSubmit = field.type === "submitButton";
  const conditionalSource = otherFields.find((entry) => entry.id === field.conditional?.fieldId);
  const conditionSources = otherFields.filter((entry) => entry.key);
  const validation = field.validation || {};
  const preset = validation.preset === "custom" ? "custom" : presetForValidation(validation);

  return (
    <>
      <div className="fb-panel__header">
        <h2 className="fb-panel__title">Field settings</h2>
        <button type="button" className="fb-icon-btn" aria-label="Close field settings" onClick={onClose}>
          <XIcon width={20} height={20} fill="currentColor" />
        </button>
      </div>

      <div className="fb-panel__stack">
        <div className="fb-typecard">
          <span className="fb-typecard__icon">
            <FieldIcon name={meta?.icon} size={22} />
          </span>
          <div>
            <div className="fb-typecard__name">{meta?.label || field.type}</div>
            <div className="fb-typecard__desc">{meta?.description}</div>
          </div>
        </div>

        {!NO_LABEL.includes(field.type) && (
          <TextField
            label={LABEL_IS_TEXT[field.type] || "Label"}
            value={field.label}
            onChange={(label) => onUpdate({ label })}
            autoComplete="off"
          />
        )}

        {RICH_TEXT_TYPES.includes(field.type) && (
          <RichTextEditor
            label={LABEL_IS_TEXT[field.type]}
            value={field.richText}
            allowLists={field.type === "paragraph"}
            minHeight={field.type === "heading" ? 48 : 110}
            onChange={(richText) => onUpdate({ richText, label: richTextToPlain(richText).slice(0, 300) })}
          />
        )}

        {field.type === "heading" && (
          <Select
            label="Heading size"
            options={[
              { value: "h2", label: "Large (H2)" },
              { value: "h3", label: "Medium (H3)" },
              { value: "h4", label: "Small (H4)" },
            ]}
            value={field.headingLevel || "h3"}
            onChange={(headingLevel) => onUpdate({ headingLevel })}
          />
        )}

        {field.type === "image" && (
          <ImageSettings
            image={field.image || {}}
            onChange={(patch) => onUpdateSection("image", patch)}
            onError={onError}
          />
        )}

        {STYLED_BLOCK_TYPES.includes(field.type) && (
          <BlockStyleSettings
            field={field}
            onChange={(patch) => onUpdateSection("blockStyle", patch)}
          />
        )}

        {field.type === "date" && (
          <DateSettings options={field.dateOptions || {}} onChange={(patch) => onUpdateSection("dateOptions", patch)} />
        )}

        {!NO_PLACEHOLDER.includes(field.type) && (
          <TextField
            label="Placeholder"
            value={field.placeholder}
            onChange={(placeholder) => onUpdate({ placeholder })}
            autoComplete="off"
          />
        )}

        {!["divider", "hiddenField", "submitButton", "image"].includes(field.type) && (
          <TextField
            label="Help text"
            value={field.helpText}
            onChange={(helpText) => onUpdate({ helpText })}
            autoComplete="off"
            helpText="Shown below the field to provide extra information."
            maxLength={300}
          />
        )}

        {!isLayout && field.type !== "hiddenField" && (
          <Switch
            label="Required field"
            description={
              field.type === "consentCheckbox"
                ? "Consent checkboxes must always be ticked."
                : "Customers must fill in this field."
            }
            checked={field.type === "consentCheckbox" ? true : Boolean(field.required)}
            disabled={field.type === "consentCheckbox"}
            onChange={(required) => onUpdate({ required })}
          />
        )}

        {twoColumn && !isSubmit && (
          <div>
            <span className="fb-field-label" id={`column-${field.id}`}>Column</span>
            <div className="fb-seg" role="group" aria-labelledby={`column-${field.id}`}>
              {[
                ["side", "Side column"],
                ["main", "Form column"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={(field.column === "side" ? "side" : "main") === value}
                  onClick={() => onUpdate({ column: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="fb-help">You can also drag fields between the two columns.</p>
          </div>
        )}

        {field.type !== "hiddenField" && (
          <div>
            <span className="fb-field-label" id={`width-${field.id}`}>Field width</span>
            <div className="fb-seg" role="group" aria-labelledby={`width-${field.id}`}>
              {WIDTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={field.width === option.value}
                  onClick={() => onUpdate({ width: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="fb-help">Fields sit side by side on wide screens and stack on phones.</p>
          </div>
        )}

        {meta?.hasOptions && <OptionsEditor field={field} onChange={(options) => onUpdate({ options })} />}

        {DEFAULT_VALUE_TYPES.includes(field.type) && (
          field.type === "dropdown" || field.type === "radio" ? (
            <Select
              label="Default selection"
              options={[{ label: "None", value: "" }, ...(field.options || []).map((option) => ({ label: option, value: option }))]}
              value={field.defaultValue || ""}
              onChange={(defaultValue) => onUpdate({ defaultValue })}
            />
          ) : (
            <TextField
              label={field.type === "hiddenField" ? "Value" : "Default value"}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={field.defaultValue || ""}
              onChange={(defaultValue) => onUpdate({ defaultValue })}
              autoComplete="off"
              helpText={field.type === "hiddenField" ? "Sent with every submission. Visitors never see it." : undefined}
            />
          )
        )}

        {field.type === "checkbox" && (
          <Switch
            label="Ticked by default"
            checked={field.defaultValue === "true"}
            onChange={(checked) => onUpdate({ defaultValue: checked ? "true" : "" })}
          />
        )}

        {PATTERN_FIELD_TYPES.includes(field.type) && (
          <div>
            <Select
              label="Validation"
              options={VALIDATION_PRESETS.map((entry) => ({ label: entry.label, value: entry.value }))}
              value={preset}
              onChange={(value) => {
                const chosen = VALIDATION_PRESETS.find((entry) => entry.value === value);
                if (value === "custom") {
                  onUpdateSection("validation", { preset: "custom" });
                } else {
                  onUpdateSection("validation", {
                    preset: value,
                    pattern: chosen?.pattern || "",
                    patternMessage: chosen?.message || "",
                  });
                }
              }}
            />
            <p className="fb-help">Choose a validation rule for this field.</p>
          </div>
        )}

        {PATTERN_FIELD_TYPES.includes(field.type) && preset === "custom" && (
          <>
            <TextField
              label="Pattern (regular expression)"
              value={validation.pattern || ""}
              onChange={(pattern) => onUpdateSection("validation", { pattern, preset: "custom" })}
              autoComplete="off"
              monospaced
              helpText="For example ^[A-Z]{2}[0-9]{4}$"
            />
            <TextField
              label="Error message"
              value={validation.patternMessage || ""}
              onChange={(patternMessage) => onUpdateSection("validation", { patternMessage })}
              autoComplete="off"
            />
          </>
        )}

        {field.type === "number" && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="Minimum"
                type="number"
                value={validation.min ?? ""}
                autoComplete="off"
                onChange={(value) => onUpdateSection("validation", { min: numberOrNull(value) })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="Maximum"
                type="number"
                value={validation.max ?? ""}
                autoComplete="off"
                onChange={(value) => onUpdateSection("validation", { max: numberOrNull(value) })}
              />
            </div>
          </div>
        )}

        {LENGTH_TYPES.includes(field.type) && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField
                label="Min characters"
                type="number"
                min={0}
                value={validation.minLength ?? ""}
                autoComplete="off"
                onChange={(value) => onUpdateSection("validation", { minLength: numberOrNull(value) })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="Max characters"
                type="number"
                min={0}
                value={validation.maxLength ?? ""}
                autoComplete="off"
                onChange={(value) => onUpdateSection("validation", { maxLength: numberOrNull(value) })}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <Section title="Layout">
          <Select
            label="Show this field"
            options={[
              { value: "", label: "Always" },
              ...conditionSources.map((entry) => ({
                value: entry.id,
                label: `When “${entry.label}” is answered…`,
              })),
            ]}
            value={field.conditional?.fieldId || ""}
            onChange={(fieldId) =>
              onUpdate({ conditional: fieldId ? { fieldId, equals: field.conditional?.equals || "" } : null })
            }
          />
          {field.conditional?.fieldId &&
            (conditionalSource?.options?.length ? (
              <Select
                label={`…with the value`}
                options={[
                  { value: "", label: "Any answer" },
                  ...conditionalSource.options.map((option) => ({ value: option, label: option })),
                ]}
                value={field.conditional.equals || ""}
                onChange={(equals) => onUpdate({ conditional: { ...field.conditional, equals } })}
              />
            ) : (
              <TextField
                label="…with the value"
                value={field.conditional.equals || ""}
                placeholder="Any answer"
                autoComplete="off"
                helpText={
                  conditionalSource?.type === "checkbox" || conditionalSource?.type === "consentCheckbox"
                    ? "Leave blank to show it once the box is ticked."
                    : "Leave blank to show it as soon as the other field is answered."
                }
                onChange={(equals) => onUpdate({ conditional: { ...field.conditional, equals } })}
              />
            ))}
          {conditionSources.length === 0 && (
            <p className="fb-help">Add another input field to show this one conditionally.</p>
          )}
        </Section>

        <Section title="Spacing">
          <SpacingEditor
            spacing={field.spacing}
            onChange={(spacing) => onUpdate({ spacing })}
          />
          <p className="fb-help">In pixels, from 0 to 96.</p>
        </Section>

        <Section title="Appearance">
          {!isLayout && !["checkbox", "consentCheckbox", "hiddenField"].includes(field.type) && (
            <Switch
              label="Hide label"
              description="Keeps the label for screen readers but hides it visually."
              checked={Boolean(field.hideLabel)}
              onChange={(hideLabel) => onUpdate({ hideLabel })}
            />
          )}
          <Switch
            label="Show on form"
            description="Turn off to keep the field without showing it to visitors."
            checked={field.visible !== false}
            disabled={isSubmit}
            onChange={(visible) => onUpdate({ visible })}
          />
          <TextField
            label="CSS class"
            value={field.cssClass || ""}
            onChange={(cssClass) => onUpdate({ cssClass: cssClass.replace(/[^a-zA-Z0-9_\- ]/g, "") })}
            autoComplete="off"
            monospaced
            helpText="Optional. Lets your theme's CSS target this field."
          />
        </Section>
      </div>

      <div className="fb-panel__footer">
        <Button onClick={onDuplicate} disabled={isSubmit}>
          Duplicate
        </Button>
        <Button tone="critical" icon={DeleteIcon} onClick={onRemove} disabled={isSubmit}>
          Delete field
        </Button>
      </div>
      {isSubmit && <p className="fb-help">Every form needs exactly one submit button.</p>}
    </>
  );
}

function BlockStyleSettings({ field, onChange }) {
  const block = field.blockStyle || {};
  const isImage = field.type === "image";
  return (
    <div className="fb-subcard">
      <span className="fb-subcard__title">Block style</span>
      <ColorField
        label="Background"
        value={block.backgroundColor}
        placeholder="None"
        onChange={(backgroundColor) => onChange({ backgroundColor })}
      />
      {!isImage && (
        <ColorField
          label="Text color"
          value={block.textColor}
          placeholder="Form default"
          onChange={(textColor) => onChange({ textColor })}
        />
      )}
      {!isImage && (
        <AlignmentPicker label="Text alignment" value={block.align || "left"} onChange={(align) => onChange({ align })} />
      )}
    </div>
  );
}

function ImageSettings({ image, onChange, onError }) {
  return (
    <>
      <ImagePicker value={image.url} onChange={(url) => onChange({ url })} onError={onError} />
      <TextField
        label="Alt text"
        value={image.alt || ""}
        autoComplete="off"
        helpText="Describes the image for screen readers."
        onChange={(alt) => onChange({ alt })}
      />
      <TextField
        label="Link (optional)"
        value={image.link || ""}
        autoComplete="off"
        placeholder="https://"
        onChange={(link) => onChange({ link })}
      />
      <RangeSlider
        label="Image width"
        min={10}
        max={100}
        value={Number(image.width) || 100}
        output
        suffix={<span style={{ minWidth: 40, display: "inline-block", textAlign: "right" }}>{image.width || 100}%</span>}
        onChange={(width) => onChange({ width })}
      />
      <RangeSlider
        label="Corner radius"
        min={0}
        max={60}
        value={Number(image.radius) || 0}
        output
        suffix={<span style={{ minWidth: 40, display: "inline-block", textAlign: "right" }}>{image.radius || 0}px</span>}
        onChange={(radius) => onChange({ radius })}
      />
      <AlignmentPicker
        label="Image alignment"
        options={["left", "center", "right"]}
        value={image.align || "center"}
        onChange={(align) => onChange({ align })}
      />
    </>
  );
}

function DateSettings({ options, onChange }) {
  return (
    <div className="fb-subcard">
      <span className="fb-subcard__title">Date picker</span>
      <Select
        label="Date format"
        options={DATE_FORMATS}
        value={options.format || "MM/DD/YYYY"}
        onChange={(format) => onChange({ format })}
        helpText="How the date is shown to visitors. Submissions always store YYYY-MM-DD."
      />
      <Select
        label="Week starts on"
        options={[
          { value: "0", label: "Sunday" },
          { value: "1", label: "Monday" },
        ]}
        value={String(options.weekStart || 0)}
        onChange={(value) => onChange({ weekStart: Number(value) })}
      />
      <Switch
        label="Disable past dates"
        checked={Boolean(options.disablePast)}
        onChange={(disablePast) => onChange({ disablePast })}
      />
      <Switch
        label="Disable weekends"
        checked={Boolean(options.disableWeekends)}
        onChange={(disableWeekends) => onChange({ disableWeekends })}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <TextField
            label="Earliest date"
            type="date"
            value={options.minDate || ""}
            autoComplete="off"
            onChange={(minDate) => onChange({ minDate })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <TextField
            label="Latest date"
            type="date"
            value={options.maxDate || ""}
            autoComplete="off"
            onChange={(maxDate) => onChange({ maxDate })}
          />
        </div>
      </div>
    </div>
  );
}

function SpacingEditor({ spacing, onChange }) {
  const current = spacing || {};
  const setSide = (kind, side, value) => {
    const num = Math.max(0, Math.min(96, Number(value) || 0));
    onChange({
      margin: { ...(current.margin || {}) },
      padding: { ...(current.padding || {}) },
      [kind]: { ...(current[kind] || {}), [side]: num },
    });
  };

  return (
    <div className="fb-spacing">
      {["margin", "padding"].map((kind) => (
        <SpacingRow key={kind} kind={kind} values={current[kind] || {}} onChange={setSide} />
      ))}
    </div>
  );
}

function SpacingRow({ kind, values, onChange }) {
  const title = kind === "margin" ? "Margin" : "Padding";
  return (
    <>
      <span className="fb-spacing__label">{title}</span>
      {SPACING_SIDES.map((side) => (
        <label key={side} className="fb-spacing__cell">
          <input
            type="number"
            min={0}
            max={96}
            value={values[side] ?? 0}
            aria-label={`${title} ${side}`}
            onChange={(event) => onChange(kind, side, event.target.value)}
          />
          <span>{side[0].toUpperCase() + side.slice(1)}</span>
        </label>
      ))}
    </>
  );
}

function OptionsEditor({ field, onChange }) {
  const options = field.options || [];
  return (
    <div>
      <span className="fb-field-label">Options</span>
      <div className="fb-options">
        {options.map((option, index) => (
          <div key={`${field.id}-option-${index}`} className="fb-options__row">
            <div>
              <TextField
                label={`Option ${index + 1}`}
                labelHidden
                value={option}
                autoComplete="off"
                onChange={(value) => {
                  const next = [...options];
                  next[index] = value;
                  onChange(next);
                }}
              />
            </div>
            <button
              type="button"
              className="fb-icon-btn fb-icon-btn--critical"
              aria-label={`Remove option ${index + 1}`}
              disabled={options.length <= 1}
              onClick={() => onChange(options.filter((_, entryIndex) => entryIndex !== index))}
            >
              <DeleteIcon width={18} height={18} fill="currentColor" />
            </button>
          </div>
        ))}
        <div>
          <Button icon={PlusIcon} onClick={() => onChange([...options, `Option ${options.length + 1}`])}>
            Add option
          </Button>
        </div>
      </div>
    </div>
  );
}
