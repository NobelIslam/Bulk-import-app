import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button, ButtonGroup, ColorPicker, DropZone, Popover, Select, TextField, Tooltip } from "@shopify/polaris";
import {
  LinkIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { sanitizeRichText, sanitizeUrl } from "../../forms/content";
import { formatColor, hsbToRgb, parseColor, rgbToHsb, toHex } from "../../forms/color";

// ─── Rich text ───────────────────────────────────────────────────────────────

const INLINE_TOOLS = [
  { command: "bold", label: "Bold (Ctrl+B)", Icon: TextBoldIcon },
  { command: "italic", label: "Italic (Ctrl+I)", Icon: TextItalicIcon },
  { command: "underline", label: "Underline (Ctrl+U)", Icon: TextUnderlineIcon },
  { command: "strikeThrough", label: "Strikethrough", text: "S" },
];
const BLOCK_TOOLS = [
  { command: "insertUnorderedList", label: "Bulleted list", Icon: ListBulletedIcon },
  { command: "insertOrderedList", label: "Numbered list", Icon: ListNumberedIcon },
];

// A small contentEditable editor. The HTML it emits is run through the same
// allowlist the server applies, so the preview never shows markup that would
// be stripped on save.
export function RichTextEditor({ label, value, onChange, allowLists = true, minHeight = 88 }) {
  const ref = useRef(null);
  const [active, setActive] = useState({});

  // Undo/redo and other outside changes replace the content, but never while
  // the merchant is typing (that would move the caret).
  useEffect(() => {
    const node = ref.current;
    if (!node || document.activeElement === node) return;
    if (node.innerHTML !== (value || "")) node.innerHTML = value || "";
  }, [value]);

  const emit = () => {
    const node = ref.current;
    if (!node) return;
    onChange(sanitizeRichText(node.innerHTML));
  };

  const refreshActive = () => {
    const next = {};
    INLINE_TOOLS.concat(BLOCK_TOOLS).forEach(({ command }) => {
      try {
        next[command] = document.queryCommandState(command);
      } catch {
        next[command] = false;
      }
    });
    setActive(next);
  };

  const run = (command, arg = null) => {
    ref.current?.focus();
    // execCommand is deprecated but remains the only editing API every browser
    // supports for contentEditable formatting.
    document.execCommand(command, false, arg);
    emit();
    refreshActive();
  };

  const addLink = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    // window.prompt is blocked inside the embedded admin, so use a tiny inline form.
    setLinkDraft({ range: selection.getRangeAt(0).cloneRange(), url: "https://" });
  };

  const [linkDraft, setLinkDraft] = useState(null);
  const applyLink = () => {
    const url = sanitizeUrl(linkDraft?.url);
    const selection = window.getSelection();
    ref.current?.focus();
    if (linkDraft?.range && selection) {
      selection.removeAllRanges();
      selection.addRange(linkDraft.range);
    }
    if (url) run("createLink", url);
    else run("unlink");
    setLinkDraft(null);
  };

  const tools = allowLists ? [...INLINE_TOOLS, ...BLOCK_TOOLS] : INLINE_TOOLS;

  return (
    <div className="fb-rte">
      {label && <span className="fb-field-label">{label}</span>}
      <div className="fb-rte__box">
        {/* Keeping mousedown from bubbling to focus keeps the editor's text selection. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          className="fb-rte__toolbar"
          role="toolbar"
          aria-label={`${label || "Text"} formatting`}
          onMouseDown={(event) => event.preventDefault()}
        >
          {tools.map(({ command, label: toolLabel, Icon, text }) => (
            <Tooltip key={command} content={toolLabel}>
              <Button
                size="slim"
                variant="tertiary"
                icon={Icon || <StrikeGlyph text={text} />}
                accessibilityLabel={toolLabel}
                pressed={Boolean(active[command])}
                onClick={() => run(command)}
              />
            </Tooltip>
          ))}
          <Tooltip content="Link (select text first)">
            <Button size="slim" variant="tertiary" icon={LinkIcon} accessibilityLabel="Add link to selected text" onClick={addLink} />
          </Tooltip>
          <Tooltip content="Clear formatting">
            <Button
              size="slim"
              variant="tertiary"
              icon={XIcon}
              accessibilityLabel="Clear formatting"
              onClick={() => {
                run("removeFormat");
                run("unlink");
              }}
            />
          </Tooltip>
        </div>
        {linkDraft && (
          <div className="fb-rte__link">
            <input
              type="url"
              value={linkDraft.url}
              aria-label="Link URL"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onChange={(event) => setLinkDraft({ ...linkDraft, url: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") setLinkDraft(null);
              }}
            />
            <Button size="slim" onClick={applyLink}>
              Apply
            </Button>
            <Button size="slim" variant="plain" onClick={() => setLinkDraft(null)}>
              Cancel
            </Button>
          </div>
        )}
        <div
          ref={ref}
          className="fb-rte__content"
          contentEditable
          tabIndex={0}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label || "Text"}
          style={{ minHeight }}
          onInput={emit}
          onBlur={emit}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onPaste={(event) => {
            // Paste as clean rich text rather than whatever the source app sent.
            const html = event.clipboardData.getData("text/html");
            const text = event.clipboardData.getData("text/plain");
            event.preventDefault();
            if (html) document.execCommand("insertHTML", false, sanitizeRichText(html));
            else document.execCommand("insertText", false, text);
            emit();
          }}
        />
      </div>
    </div>
  );
}

// ─── Alignment ───────────────────────────────────────────────────────────────

const ALIGN_ICONS = { left: TextAlignLeftIcon, center: TextAlignCenterIcon, right: TextAlignRightIcon };

export function AlignmentPicker({ label = "Alignment", value, onChange, options = ["left", "center", "right", "justify"] }) {
  return (
    <div>
      <span className="fb-field-label">{label}</span>
      <ButtonGroup variant="segmented" fullWidth>
        {options.map((option) => {
          const name = option[0].toUpperCase() + option.slice(1);
          return (
            <Button
              key={option}
              icon={ALIGN_ICONS[option] || JustifyIcon}
              accessibilityLabel={name}
              pressed={value === option}
              onClick={() => onChange(option)}
            />
          );
        })}
      </ButtonGroup>
    </div>
  );
}

function StrikeGlyph({ text }) {
  return <s style={{ fontWeight: 600, lineHeight: "20px" }}>{text}</s>;
}

function JustifyIcon(props) {
  return (
    <svg viewBox="0 0 20 20" {...props}>
      <rect x="3" y="4" width="14" height="1.6" rx=".8" />
      <rect x="3" y="8" width="14" height="1.6" rx=".8" />
      <rect x="3" y="12" width="14" height="1.6" rx=".8" />
      <rect x="3" y="16" width="14" height="1.6" rx=".8" />
    </svg>
  );
}

// ─── Image picker ────────────────────────────────────────────────────────────

// URL field plus an upload button that stores the file in Shopify Files.
export function ImagePicker({ label = "Image", value, onChange, onError }) {
  const fetcher = useFetcher();
  const uploading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) onChange(fetcher.data.url);
    else onError?.(fetcher.data.message);
    // Only react to a finished upload, not to onChange identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const upload = (file) => {
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    fetcher.submit(data, { method: "post", action: "/app/forms/upload", encType: "multipart/form-data" });
  };

  return (
    <div className="fb-image-picker">
      <span className="fb-field-label">{label}</span>
      {value ? (
        <div className="fb-image-picker__preview">
          <img src={value} alt="" />
          <Button icon={XIcon} variant="tertiary" accessibilityLabel="Remove image" onClick={() => onChange("")} />
        </div>
      ) : (
        <DropZone
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          type="image"
          allowMultiple={false}
          disabled={uploading}
          onDrop={(_files, accepted) => upload(accepted[0])}
        >
          <DropZone.FileUpload
            actionTitle={uploading ? "Uploading…" : "Upload image"}
            actionHint="or drop an image here"
          />
        </DropZone>
      )}
      <div style={{ marginTop: 8 }}>
        <TextField
          label="Image URL"
          labelHidden
          placeholder="…or paste an image URL (https://…)"
          value={value || ""}
          autoComplete="off"
          onChange={onChange}
        />
      </div>
    </div>
  );
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const PRESET_COLORS = ["#000000", "#ffffff", "#202223", "#616161", "#f6f6f7", "#005bd3", "#008060", "#d72c0d", "#ffc453", "#8051ff"];
const FORMATS = [
  { label: "HEX", value: "hex" },
  { label: "RGBA", value: "rgba" },
  { label: "HSLA", value: "hsla" },
];
const CHECKERBOARD = "repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 50% / 8px 8px";

function Swatch({ color, size = 20 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: size,
        height: size,
        borderRadius: 4,
        boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.18)",
        background: color ? `linear-gradient(${color}, ${color}), ${CHECKERBOARD}` : CHECKERBOARD,
      }}
    />
  );
}

// Color input with an advanced picker: saturation/hue/opacity, HEX, RGBA or
// HSLA entry, presets and a one-click transparent option. Whatever is typed is
// stored as hex (#rrggbbaa when partly transparent).
export function ColorField({ label, value, onChange, placeholder, helpText }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("hex");
  const [draft, setDraft] = useState(null);
  const parsed = parseColor(value);
  const [hsb, setHsb] = useState(() => rgbToHsb(parsed || { r: 255, g: 255, b: 255, a: 1 }));
  const emitted = useRef(value);

  // Follow outside changes (undo, reset) without disturbing the hue while the
  // merchant drags through greys, where hue can't be derived from the color.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const next = parseColor(value);
    if (next) setHsb(rgbToHsb(next));
  }, [value]);

  const emit = (hex) => {
    emitted.current = hex;
    onChange(hex);
  };

  const commit = (text) => {
    if (text === null) return;
    if (!text.trim()) {
      setDraft(null);
      emit("");
      return;
    }
    const next = parseColor(text);
    if (!next) return;
    setDraft(null);
    setHsb(rgbToHsb(next));
    emit(toHex(next));
  };

  const shown = draft ?? (parsed ? formatColor(parsed, format) : value || "");
  const invalid = draft !== null && draft.trim() !== "" && !parseColor(draft);

  const activator = (
    <Button
      icon={<Swatch color={parsed ? toHex(parsed) : ""} />}
      accessibilityLabel={`Pick ${label.toLowerCase()} color`}
      onClick={() => setOpen((current) => !current)}
    />
  );

  return (
    <TextField
      label={label}
      value={shown}
      onChange={setDraft}
      onBlur={() => commit(draft)}
      autoComplete="off"
      monospaced
      placeholder={placeholder}
      helpText={helpText || (parsed && parsed.a < 1 ? `${Math.round(parsed.a * 100)}% opacity` : undefined)}
      clearButton={Boolean(placeholder)}
      onClearButtonClick={() => {
        setDraft(null);
        emit("");
      }}
      error={invalid ? "Use a color like #1a2b3c, rgba(26, 43, 60, 0.5) or hsl(210, 40%, 17%)." : undefined}
      connectedLeft={
        <Popover active={open} activator={activator} onClose={() => setOpen(false)} preferredAlignment="left" sectioned>
          <div className="fb-colorpop">
            <ColorPicker
              allowAlpha
              fullWidth
              color={hsb}
              onChange={(next) => {
                setHsb(next);
                setDraft(null);
                emit(toHex(hsbToRgb(next)));
              }}
            />
            <div className="fb-colorpop__row">
              <div style={{ width: 92 }}>
                <Select label="Format" labelHidden options={FORMATS} value={format} onChange={setFormat} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label={`${label} value`}
                  labelHidden
                  value={shown}
                  onChange={setDraft}
                  onBlur={() => commit(draft)}
                  autoComplete="off"
                  monospaced
                  error={invalid}
                />
              </div>
            </div>
            <div className="fb-colorpop__swatches" role="group" aria-label="Preset colors">
              <Tooltip content="Transparent">
                <Button
                  size="micro"
                  variant="tertiary"
                  icon={<Swatch color="#00000000" size={18} />}
                  accessibilityLabel="Transparent"
                  pressed={parsed?.a === 0}
                  onClick={() => commit("transparent")}
                />
              </Tooltip>
              {PRESET_COLORS.map((preset) => (
                <Tooltip key={preset} content={preset}>
                  <Button
                    size="micro"
                    variant="tertiary"
                    icon={<Swatch color={preset} size={18} />}
                    accessibilityLabel={preset}
                    pressed={parsed ? toHex(parsed) === preset : false}
                    onClick={() => commit(preset)}
                  />
                </Tooltip>
              ))}
            </div>
            <div className="fb-colorpop__actions">
              <Button size="slim" onClick={() => commit("transparent")}>
                Make transparent
              </Button>
              {placeholder && (
                <Button size="slim" variant="plain" onClick={() => commit("")}>
                  Use default
                </Button>
              )}
            </div>
          </div>
        </Popover>
      }
    />
  );
}
