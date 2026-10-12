import { Button, ButtonGroup, RangeSlider, Select, TextField } from "@shopify/polaris";
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon, DuplicateIcon, PlusIcon, XIcon } from "@shopify/polaris-icons";
import { applyColumnPreset, COLUMN_PRESETS, FONT_FAMILIES, getBlockType, SPACING_SIDES } from "../../blog/blocks";
import { AlignmentPicker, ColorField, ImagePicker, RichTextEditor } from "../forms/ContentControls";
import { Section, Switch } from "../forms/FieldSettings";
import { BlockIcon } from "./BlockPalette";

function Slider({ label, value, min, max, step = 1, unit = "px", zeroLabel, onChange, helpText }) {
  const shown = value === 0 && zeroLabel ? zeroLabel : `${value}${unit}`;
  return (
    <RangeSlider
      label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      helpText={helpText}
      output
      suffix={<span style={{ minWidth: 56, textAlign: "right", display: "inline-block" }}>{shown}</span>}
      onChange={(next) => onChange(Number(next))}
    />
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div>
      <span className="fb-field-label">{label}</span>
      <ButtonGroup variant="segmented" fullWidth>
        {options.map((option) => (
          <Button key={option.value} pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}

function SpacingEditor({ spacing, onChange, allowNegative }) {
  const set = (kind, side, raw) => {
    const num = Number(raw) || 0;
    const value = Math.max(kind === "padding" || !allowNegative ? 0 : -200, Math.min(200, num));
    onChange({ ...spacing, [kind]: { ...spacing[kind], [side]: value } });
  };
  return (
    <div className="fb-spacing">
      {["margin", "padding"].map((kind) => (
        <SpacingRow key={kind} kind={kind} values={spacing[kind]} onChange={set} />
      ))}
    </div>
  );
}

function SpacingRow({ kind, values, onChange }) {
  const title = kind === "margin" ? "Outside" : "Inside";
  return (
    <>
      <span className="fb-spacing__label">{title}</span>
      {SPACING_SIDES.map((side) => (
        <label key={side} className="fb-spacing__cell">
          <input
            type="number"
            value={values[side]}
            aria-label={`${title} spacing ${side}`}
            onChange={(event) => onChange(kind, side, event.target.value)}
          />
          <span>{side[0].toUpperCase() + side.slice(1)}</span>
        </label>
      ))}
    </>
  );
}

const ASPECT_OPTIONS = [
  { label: "Original", value: "auto" },
  { label: "Square (1:1)", value: "1:1" },
  { label: "Landscape (4:3)", value: "4:3" },
  { label: "Photo (3:2)", value: "3:2" },
  { label: "Wide (16:9)", value: "16:9" },
  { label: "Portrait (3:4)", value: "3:4" },
];
const VALIGN = [
  { label: "Top", value: "top" },
  { label: "Middle", value: "center" },
  { label: "Bottom", value: "bottom" },
];

function ContentFields({ block, setProps, onUpdate, onError }) {
  const p = block.props;
  switch (block.type) {
    case "section":
      return (
        <>
          <ImagePicker label="Background image" value={p.backgroundImage} onChange={(backgroundImage) => setProps({ backgroundImage })} onError={onError} />
          {p.backgroundImage && (
            <ColorField label="Image overlay" value={p.overlay} placeholder="None" helpText="A see-through color over the image keeps text readable." onChange={(overlay) => setProps({ overlay })} />
          )}
          <Switch label="Full-width content" description="Off keeps the content in a centered column." checked={!p.contentWidth} onChange={(full) => setProps({ contentWidth: full ? 0 : 760 })} />
          {Boolean(p.contentWidth) && <Slider label="Content width" min={280} max={1600} step={10} value={p.contentWidth} onChange={(contentWidth) => setProps({ contentWidth })} />}
          <Slider label="Minimum height" min={0} max={900} step={10} value={p.minHeight} zeroLabel="Auto" onChange={(minHeight) => setProps({ minHeight })} />
          {Boolean(p.minHeight) && <Segmented label="Content position" value={p.verticalAlign} options={VALIGN} onChange={(verticalAlign) => setProps({ verticalAlign })} />}
        </>
      );
    case "columns":
      return (
        <>
          <div>
            <span className="fb-field-label">Column layout</span>
            <div className="bb-colpresets">
              {COLUMN_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className="bb-colpreset"
                  aria-pressed={p.preset === preset.value}
                  aria-label={`Columns ${preset.label}`}
                  onClick={() => onUpdate((current) => applyColumnPreset(current, preset.value))}
                >
                  {preset.widths.map((width, index) => (
                    <span key={index} style={{ flex: width }} />
                  ))}
                </button>
              ))}
            </div>
            <p className="fb-help">Columns sit side by side on wide screens and stack on phones. Content is kept when you change the layout.</p>
          </div>
          <Slider label="Space between columns" min={0} max={120} value={p.gap} onChange={(gap) => setProps({ gap })} />
          <Segmented label="Align columns" value={p.verticalAlign} options={VALIGN} onChange={(verticalAlign) => setProps({ verticalAlign })} />
        </>
      );
    case "heading":
      return (
        <>
          <TextField label="Heading text" value={p.text} multiline={2} autoComplete="off" onChange={(text) => setProps({ text })} />
          <Segmented
            label="Heading level"
            value={p.level}
            options={[1, 2, 3, 4, 5, 6].map((level) => ({ label: `H${level}`, value: level }))}
            onChange={(level) => setProps({ level })}
          />
          <p className="fb-help" style={{ marginTop: -8 }}>Use H2 for main sections and H3 inside them. Your post title is already the H1.</p>
          <Slider label="Size" min={0} max={96} value={p.fontSize} zeroLabel="Auto" onChange={(fontSize) => setProps({ fontSize })} />
          <Select
            label="Weight"
            options={[300, 400, 500, 600, 700, 800, 900].map((weight) => ({ label: { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" }[weight], value: String(weight) }))}
            value={String(p.fontWeight)}
            onChange={(fontWeight) => setProps({ fontWeight: Number(fontWeight) })}
          />
          <Slider label="Line height" min={0} max={2.5} step={0.05} unit="" value={p.lineHeight} zeroLabel="Auto" onChange={(lineHeight) => setProps({ lineHeight })} />
          <Slider label="Letter spacing" min={-3} max={12} step={0.5} value={p.letterSpacing} onChange={(letterSpacing) => setProps({ letterSpacing })} />
          <Switch label="All caps" checked={p.uppercase} onChange={(uppercase) => setProps({ uppercase })} />
        </>
      );
    case "text":
      return (
        <>
          <RichTextEditor label="Text" value={p.html} minHeight={160} onChange={(html) => setProps({ html }, "html")} />
          <Slider label="Text size" min={0} max={48} value={p.fontSize} zeroLabel="Default" onChange={(fontSize) => setProps({ fontSize })} />
          <Slider label="Line height" min={0} max={2.5} step={0.05} unit="" value={p.lineHeight} zeroLabel="Default" onChange={(lineHeight) => setProps({ lineHeight })} />
        </>
      );
    case "image":
      return (
        <>
          <ImagePicker label="Image" value={p.url} onChange={(url) => setProps({ url })} onError={onError} />
          <TextField label="Alt text" value={p.alt} autoComplete="off" helpText="Describe the image for screen readers and search engines." onChange={(alt) => setProps({ alt })} />
          <Slider label="Width" min={10} max={100} unit="%" value={p.width} onChange={(width) => setProps({ width })} />
          <Select label="Shape" options={ASPECT_OPTIONS} value={p.aspect} onChange={(aspect) => setProps({ aspect })} />
          <TextField label="Caption" value={p.caption} autoComplete="off" onChange={(caption) => setProps({ caption })} />
          <TextField label="Link (optional)" value={p.link} autoComplete="off" placeholder="/products/... or https://..." onChange={(link) => setProps({ link })} />
          {p.link && <Switch label="Open link in a new tab" checked={p.newTab} onChange={(newTab) => setProps({ newTab })} />}
        </>
      );
    case "button":
      return (
        <>
          <TextField label="Button text" value={p.label} autoComplete="off" onChange={(label) => setProps({ label })} />
          <TextField label="Link" value={p.url} autoComplete="off" placeholder="/collections/all or https://..." onChange={(url) => setProps({ url })} />
          <Switch label="Open in a new tab" checked={p.newTab} onChange={(newTab) => setProps({ newTab })} />
          <Segmented
            label="Style"
            value={p.variant}
            options={[
              { label: "Filled", value: "solid" },
              { label: "Outline", value: "outline" },
              { label: "Link", value: "link" },
            ]}
            onChange={(variant) => setProps({ variant })}
          />
          <Segmented
            label="Size"
            value={p.size}
            options={[
              { label: "Small", value: "sm" },
              { label: "Medium", value: "md" },
              { label: "Large", value: "lg" },
            ]}
            onChange={(size) => setProps({ size })}
          />
          <ColorField label="Button color" value={p.color} onChange={(color) => setProps({ color })} />
          {p.variant === "solid" && <ColorField label="Text color" value={p.labelColor} onChange={(labelColor) => setProps({ labelColor })} />}
          <Slider label="Corner radius" min={0} max={60} value={p.radius} onChange={(radius) => setProps({ radius })} />
          <Switch label="Full width" checked={p.fullWidth} onChange={(fullWidth) => setProps({ fullWidth })} />
        </>
      );
    case "video":
      return (
        <>
          <TextField
            label="Video link"
            value={p.url}
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=..."
            helpText="Paste a YouTube or Vimeo link."
            error={p.url && !/youtu|vimeo/i.test(p.url) ? "Only YouTube and Vimeo links are supported." : undefined}
            onChange={(url) => setProps({ url })}
          />
          <Select
            label="Shape"
            options={[
              { label: "Widescreen (16:9)", value: "16:9" },
              { label: "Classic (4:3)", value: "4:3" },
              { label: "Square (1:1)", value: "1:1" },
              { label: "Vertical (9:16)", value: "9:16" },
            ]}
            value={p.aspect}
            onChange={(aspect) => setProps({ aspect })}
          />
        </>
      );
    case "quote":
      return (
        <>
          <RichTextEditor label="Quote" value={p.html} allowLists={false} onChange={(html) => setProps({ html }, "html")} />
          <TextField label="Who said it (optional)" value={p.cite} autoComplete="off" onChange={(cite) => setProps({ cite })} />
          <Segmented
            label="Style"
            value={p.variant}
            options={[
              { label: "Side bar", value: "bar" },
              { label: "Box", value: "boxed" },
              { label: "Large", value: "large" },
            ]}
            onChange={(variant) => setProps({ variant })}
          />
          <ColorField label="Accent color" value={p.accent} onChange={(accent) => setProps({ accent })} />
          <Slider label="Text size" min={0} max={48} value={p.fontSize} zeroLabel="Auto" onChange={(fontSize) => setProps({ fontSize })} />
        </>
      );
    case "list":
      return (
        <>
          <div>
            <span className="fb-field-label">Items</span>
            <div className="fb-options">
              {p.items.map((item, index) => (
                <div key={index} className="fb-options__row">
                  <div>
                    <TextField
                      label={`Item ${index + 1}`}
                      labelHidden
                      value={item}
                      autoComplete="off"
                      onChange={(value) => setProps({ items: p.items.map((entry, i) => (i === index ? value : entry)) }, `item-${index}`)}
                    />
                  </div>
                  <Button
                    icon={DeleteIcon}
                    variant="tertiary"
                    tone="critical"
                    accessibilityLabel={`Remove item ${index + 1}`}
                    disabled={p.items.length <= 1}
                    onClick={() => setProps({ items: p.items.filter((_, i) => i !== index) })}
                  />
                </div>
              ))}
              <div>
                <Button icon={PlusIcon} onClick={() => setProps({ items: [...p.items, "New item"] })}>
                  Add item
                </Button>
              </div>
            </div>
          </div>
          <Select
            label="Marker"
            options={[
              { label: "✓ Check", value: "check" },
              { label: "• Dot", value: "dot" },
              { label: "→ Arrow", value: "arrow" },
              { label: "★ Star", value: "star" },
              { label: "1. Number", value: "number" },
            ]}
            value={p.icon}
            onChange={(icon) => setProps({ icon })}
          />
          <ColorField label="Marker color" value={p.iconColor} onChange={(iconColor) => setProps({ iconColor })} />
          <Slider label="Space between items" min={0} max={40} value={p.gap} onChange={(gap) => setProps({ gap })} />
        </>
      );
    case "divider":
      return (
        <>
          <Select
            label="Line style"
            options={[
              { label: "Solid", value: "solid" },
              { label: "Dashed", value: "dashed" },
              { label: "Dotted", value: "dotted" },
              { label: "Double", value: "double" },
            ]}
            value={p.lineStyle}
            onChange={(lineStyle) => setProps({ lineStyle })}
          />
          <Slider label="Thickness" min={1} max={12} value={p.thickness} onChange={(thickness) => setProps({ thickness })} />
          <Slider label="Width" min={5} max={100} unit="%" value={p.width} onChange={(width) => setProps({ width })} />
          <ColorField label="Color" value={p.color} onChange={(color) => setProps({ color })} />
        </>
      );
    case "spacer":
      return <Slider label="Height" min={0} max={400} step={4} value={p.height} onChange={(height) => setProps({ height })} />;
    case "html":
      return (
        <TextField
          label="HTML"
          value={p.code}
          multiline={10}
          monospaced
          autoComplete="off"
          helpText="Scripts, event handlers and unknown iframes are removed when you save. YouTube, Vimeo, Spotify and Google Maps embeds are kept."
          onChange={(code) => setProps({ code }, "code")}
        />
      );
    default:
      return null;
  }
}

// Right panel for the selected element.
export default function BlockSettings({ block, parentLabel, onUpdate, onMove, onDuplicate, onRemove, onSelectParent, onClose, onError }) {
  const meta = getBlockType(block.type);
  const s = block.style;
  const setProps = (patch, key = "props") =>
    onUpdate((current) => ({ ...current, props: { ...current.props, ...patch } }), `${block.id}-${key}-${Object.keys(patch).join("-")}`);
  const setStyle = (patch) =>
    onUpdate((current) => ({ ...current, style: { ...current.style, ...patch } }), `${block.id}-style-${Object.keys(patch).join("-")}`);

  return (
    <>
      <div className="fb-panel__header">
        <h2 className="fb-panel__title">Element settings</h2>
        <Button icon={XIcon} variant="tertiary" accessibilityLabel="Close element settings" onClick={onClose} />
      </div>

      <div className="fb-typecard" style={{ marginBottom: 12 }}>
        <span className="fb-typecard__icon">
          <BlockIcon name={meta.icon} size={22} />
        </span>
        <div>
          <div className="fb-typecard__name">{meta.label}</div>
          <div className="fb-typecard__desc">{meta.description}</div>
        </div>
      </div>

      <div className="bb-quickactions">
        <Button icon={ArrowUpIcon} accessibilityLabel="Move up" onClick={() => onMove(-1)} />
        <Button icon={ArrowDownIcon} accessibilityLabel="Move down" onClick={() => onMove(1)} />
        <Button icon={DuplicateIcon} onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button icon={DeleteIcon} tone="critical" onClick={onRemove}>
          Delete
        </Button>
      </div>
      {parentLabel && (
        <div style={{ margin: "4px 0 8px" }}>
          <Button variant="plain" onClick={onSelectParent}>
            {`Select the ${parentLabel} it's inside`}
          </Button>
        </div>
      )}

      <Section title="Content" defaultOpen>
        <ContentFields block={block} setProps={setProps} onUpdate={onUpdate} onError={onError} />
      </Section>

      <Section title="Style">
        <ColorField label="Background" value={s.background} placeholder="None" onChange={(background) => setStyle({ background })} />
        {block.type !== "spacer" && block.type !== "divider" && (
          <ColorField label="Text color" value={s.textColor} placeholder="Page default" onChange={(textColor) => setStyle({ textColor })} />
        )}
        {block.type !== "spacer" && (
          <div>
            <AlignmentPicker label="Alignment" value={s.align || "left"} onChange={(align) => setStyle({ align })} />
            {s.align && (
              <Button variant="plain" onClick={() => setStyle({ align: "" })}>
                Use default alignment
              </Button>
            )}
          </div>
        )}
        <Slider label="Border" min={0} max={12} value={s.borderWidth} zeroLabel="None" onChange={(borderWidth) => setStyle({ borderWidth })} />
        {Boolean(s.borderWidth) && <ColorField label="Border color" value={s.borderColor} onChange={(borderColor) => setStyle({ borderColor })} />}
        <Slider label="Corner radius" min={0} max={80} value={s.borderRadius} onChange={(borderRadius) => setStyle({ borderRadius })} />
        <Switch label="Shadow" description="A soft shadow around the element." checked={s.shadow} onChange={(shadow) => setStyle({ shadow })} />
        <Slider
          label="Maximum width"
          min={0}
          max={1600}
          step={10}
          value={s.maxWidth}
          zeroLabel="None"
          helpText="Narrower elements are centered."
          onChange={(maxWidth) => setStyle({ maxWidth })}
        />
      </Section>

      <Section title="Spacing">
        <SpacingEditor spacing={{ margin: s.margin, padding: s.padding }} allowNegative onChange={(next) => setStyle(next)} />
        <p className="fb-help">Outside spacing pushes other elements away; inside spacing adds room around the content. In pixels.</p>
      </Section>
    </>
  );
}

// Right panel on the Design tab: page-wide typography, colors and widths.
export function DesignPanel({ design, onChange }) {
  return (
    <>
      <Section title="Layout" defaultOpen>
        <Switch
          label="Full-width post"
          description="Off keeps your post in a readable centered column."
          checked={!design.contentWidth}
          onChange={(full) => onChange({ contentWidth: full ? 0 : 760 })}
        />
        {Boolean(design.contentWidth) && (
          <Slider label="Post width" min={480} max={1600} step={10} value={design.contentWidth} onChange={(contentWidth) => onChange({ contentWidth })} />
        )}
        <Slider label="Space between elements" min={0} max={80} value={design.blockGap} onChange={(blockGap) => onChange({ blockGap })} />
      </Section>
      <Section title="Typography" defaultOpen>
        <Select
          label="Font"
          options={FONT_FAMILIES.map(({ value, label }) => ({ value, label }))}
          value={design.fontFamily}
          onChange={(fontFamily) => onChange({ fontFamily })}
        />
        <Slider label="Text size" min={12} max={26} value={design.fontSize} onChange={(fontSize) => onChange({ fontSize })} />
        <Slider label="Line height" min={1} max={2.4} step={0.05} unit="" value={design.lineHeight} onChange={(lineHeight) => onChange({ lineHeight })} />
      </Section>
      <Section title="Colors" defaultOpen>
        <ColorField label="Text" value={design.textColor} placeholder="Theme default" onChange={(textColor) => onChange({ textColor })} />
        <ColorField label="Headings" value={design.headingColor} placeholder="Theme default" onChange={(headingColor) => onChange({ headingColor })} />
        <ColorField label="Links" value={design.linkColor} placeholder="Theme default" onChange={(linkColor) => onChange({ linkColor })} />
        <ColorField label="Post background" value={design.background} placeholder="None" onChange={(background) => onChange({ background })} />
      </Section>
    </>
  );
}
