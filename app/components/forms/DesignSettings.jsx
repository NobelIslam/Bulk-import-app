import { RangeSlider, Select } from "@shopify/polaris";
import { ALIGNMENTS, BUTTON_STYLES, FONT_FAMILIES, INPUT_STYLES, NUMERIC_RANGES } from "../../forms/design";
import { Section, Switch } from "./FieldSettings";
import { ColorField } from "./ContentControls";
import { parseColor, toHex } from "../../forms/color";

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
  const cardColor = parseColor(current.backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const setCardAlpha = (alpha) => onChange({ backgroundColor: toHex({ ...cardColor, a: alpha }) });

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

      <Section title="Card" defaultOpen>
        <ColorField
          label="Card background"
          value={current.backgroundColor || ""}
          onChange={(backgroundColor) => onChange({ backgroundColor })}
        />
        <RangeSlider
          label="Background opacity"
          min={0}
          max={100}
          value={Math.round(cardColor.a * 100)}
          output
          suffix={<span style={{ minWidth: 44, textAlign: "right", display: "inline-block" }}>{Math.round(cardColor.a * 100)}%</span>}
          onChange={(value) => setCardAlpha(value / 100)}
        />
        <Switch
          label="Transparent background"
          description="Lets your page's own background show through the form."
          checked={cardColor.a === 0}
          onChange={(transparent) => setCardAlpha(transparent ? 0 : 1)}
        />
        <Switch
          label="Card shadow"
          description="Adds a soft shadow around the form."
          checked={Boolean(current.showShadow)}
          onChange={(showShadow) => onChange({ showShadow })}
        />
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
      </Section>
    </div>
  );
}
