import { BlockStack, Checkbox, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { ALIGNMENTS, BUTTON_STYLES, FONT_FAMILIES, INPUT_STYLES } from "../../forms/design";

const numberFields = [
  ["formWidth", "Form width"],
  ["padding", "Padding"],
  ["gap", "Field spacing"],
  ["labelFontSize", "Label size"],
  ["inputFontSize", "Input text size"],
  ["headingFontSize", "Heading size"],
  ["buttonFontSize", "Button text size"],
  ["borderRadius", "Corner radius"],
];

const colorFields = [
  ["backgroundColor", "Background color"],
  ["textColor", "Text color"],
  ["labelColor", "Label color"],
  ["borderColor", "Border color"],
  ["accentColor", "Focus/accent color"],
  ["buttonBackground", "Button color"],
  ["buttonTextColor", "Button text color"],
];

export default function DesignSettings({ style, viewport, onChange }) {
  const current = style || {};
  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <BlockStack gap="400">
        <Text as="h2" variant="headingSm">Design</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Customize the form appearance. Mobile values can override desktop values.
        </Text>
        <Select label="Font" options={FONT_FAMILIES} value={current.fontFamily || "inherit"} onChange={(fontFamily) => onChange({ fontFamily })} />
        <InlineStack gap="200" wrap>
          <Select label="Alignment" options={ALIGNMENTS} value={current.alignment || "left"} onChange={(alignment) => onChange({ alignment })} />
          <Select label="Input style" options={INPUT_STYLES} value={current.inputStyle || "outline"} onChange={(inputStyle) => onChange({ inputStyle })} />
          <Select label="Button style" options={BUTTON_STYLES} value={current.buttonStyle || "solid"} onChange={(buttonStyle) => onChange({ buttonStyle })} />
        </InlineStack>
        {numberFields.map(([key, label]) => (
          <TextField key={key} label={label} type="number" value={String(current[key] ?? "")} onChange={(value) => onChange({ [key]: Number(value) || 0 })} autoComplete="off" />
        ))}
        {colorFields.map(([key, label]) => (
          <TextField key={key} label={label} value={current[key] || ""} onChange={(value) => onChange({ [key]: value })} autoComplete="off" />
        ))}
        <Checkbox label="Show form shadow" checked={Boolean(current.showShadow)} onChange={(showShadow) => onChange({ showShadow })} />
      </BlockStack>
    </div>
  );
}
