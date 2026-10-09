import { RangeSlider, Select } from "@shopify/polaris";
import { ALIGNMENTS, BUTTON_STYLES, FONT_FAMILIES, INPUT_STYLES, NUMERIC_RANGES } from "../../forms/design";
import { Section, Switch } from "./FieldSettings";
import { ColorField } from "./ContentControls";

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
