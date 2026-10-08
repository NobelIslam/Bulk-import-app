import { RangeSlider, Select, TextField } from "@shopify/polaris";
import { ALIGNMENTS, BUTTON_STYLES, FONT_FAMILIES, INPUT_STYLES, NUMERIC_RANGES } from "../../forms/design";
import { Section, Switch } from "./FieldSettings";

const typography = [
  ["labelFontSize", "Label size"],
  ["inputFontSize", "Input text size"],
  ["headingFontSize", "Heading size"],
  ["buttonFontSize", "Button text size"],
];

const layout = [
  ["formWidth", "Form width"],
  ["padding", "Inner padding"],
  ["gap", "Space between fields"],
  ["borderRadius", "Corner radius"],
];

const colorFields = [
  ["backgroundColor", "Background"],
  ["textColor", "Text"],
  ["labelColor", "Labels"],
  ["borderColor", "Input borders"],
  ["accentColor", "Focus / accent"],
  ["buttonBackground", "Button"],
  ["buttonTextColor", "Button text"],
];

// `style` is the resolved style for the active viewport, so mobile shows the
// inherited desktop value until it is overridden.
export default function DesignSettings({ style, onChange }) {
  const current = style || {};

  const slider = ([key, label]) => {
    const [min, max] = NUMERIC_RANGES[key];
    return (
      <RangeSlider
        key={key}
        label={label}
        min={min}
        max={max}
        value={Number(current[key]) || min}
        output
        suffix={<span style={{ minWidth: 44, textAlign: "right", display: "inline-block" }}>{current[key]}px</span>}
        onChange={(value) => onChange({ [key]: value })}
      />
    );
  };

  return (
    <div>
      <Section title="Typography" defaultOpen>
        <Select
          label="Font"
          options={FONT_FAMILIES.map(({ value, label }) => ({ value, label }))}
          value={current.fontFamily || "inherit"}
          onChange={(fontFamily) => onChange({ fontFamily })}
        />
        {typography.map(slider)}
      </Section>

      <Section title="Colors" defaultOpen>
        {colorFields.map(([key, label]) => (
          <ColorField key={key} label={label} value={current[key] || ""} onChange={(value) => onChange({ [key]: value })} />
        ))}
      </Section>

      <Section title="Layout">
        <Select
          label="Alignment"
          options={ALIGNMENTS}
          value={current.alignment || "left"}
          onChange={(alignment) => onChange({ alignment })}
        />
        {layout.map(slider)}
      </Section>

      <Section title="Inputs & buttons">
        <Select
          label="Input style"
          options={INPUT_STYLES}
          value={current.inputStyle || "outline"}
          onChange={(inputStyle) => onChange({ inputStyle })}
        />
        <Select
          label="Button style"
          options={BUTTON_STYLES}
          value={current.buttonStyle || "solid"}
          onChange={(buttonStyle) => onChange({ buttonStyle })}
        />
        <Switch
          label="Card shadow"
          description="Adds a soft shadow around the form."
          checked={Boolean(current.showShadow)}
          onChange={(showShadow) => onChange({ showShadow })}
        />
      </Section>
    </div>
  );
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function ColorField({ label, value, onChange }) {
  const swatchColor = HEX_PATTERN.test(value) ? value : "#ffffff";
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      autoComplete="off"
      monospaced
      error={value && !HEX_PATTERN.test(value) ? "Use a hex color like #1a2b3c." : undefined}
      connectedLeft={
        <div style={{ position: "relative", width: 36, height: 36 }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              margin: 2,
              borderRadius: 6,
              border: "1px solid #c9cccf",
              background: swatchColor,
              pointerEvents: "none",
            }}
          />
          <input
            type="color"
            value={swatchColor.length === 4 ? `#${[...swatchColor.slice(1)].map((c) => c + c).join("")}` : swatchColor}
            onChange={(event) => onChange(event.target.value)}
            aria-label={`${label} color picker`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0 }}
          />
        </div>
      }
    />
  );
}
