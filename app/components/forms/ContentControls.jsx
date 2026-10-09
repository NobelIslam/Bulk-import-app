import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Button, TextField } from "@shopify/polaris";
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
  UploadIcon,
  XIcon,
} from "@shopify/polaris-icons";
import { sanitizeRichText, sanitizeUrl } from "../../forms/content";

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
        <div className="fb-rte__toolbar" role="toolbar" aria-label={`${label || "Text"} formatting`}>
          {tools.map(({ command, label: toolLabel, Icon, text }) => (
            <button
              key={command}
              type="button"
              className="fb-rte__btn"
              aria-label={toolLabel}
              title={toolLabel}
              aria-pressed={Boolean(active[command])}
              // Keep the text selection: mousedown would otherwise blur the editor.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(command)}
            >
              {Icon ? <Icon width={18} height={18} fill="currentColor" /> : <s style={{ fontWeight: 600 }}>{text}</s>}
            </button>
          ))}
          <button
            type="button"
            className="fb-rte__btn"
            aria-label="Add link to selected text"
            title="Link (select text first)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={addLink}
          >
            <LinkIcon width={18} height={18} fill="currentColor" />
          </button>
          <button
            type="button"
            className="fb-rte__btn"
            aria-label="Clear formatting"
            title="Clear formatting"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              run("removeFormat");
              run("unlink");
            }}
          >
            <XIcon width={18} height={18} fill="currentColor" />
          </button>
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
      <div className="fb-seg" role="group" aria-label={label}>
        {options.map((option) => {
          const Icon = ALIGN_ICONS[option];
          const name = option[0].toUpperCase() + option.slice(1);
          return (
            <button key={option} type="button" aria-pressed={value === option} aria-label={name} title={name} onClick={() => onChange(option)}>
              {Icon ? (
                <Icon width={18} height={18} fill="currentColor" style={{ verticalAlign: "middle" }} />
              ) : (
                <JustifyIcon />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JustifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" style={{ verticalAlign: "middle" }}>
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
  const inputRef = useRef(null);
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
          <button type="button" className="fb-icon-btn" aria-label="Remove image" title="Remove image" onClick={() => onChange("")}>
            <XIcon width={18} height={18} fill="currentColor" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="fb-image-picker__drop"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            upload(event.dataTransfer.files?.[0]);
          }}
          disabled={uploading}
        >
          <UploadIcon width={22} height={22} fill="currentColor" aria-hidden="true" />
          <span>{uploading ? "Uploading…" : "Upload an image or drop it here"}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        hidden
        onChange={(event) => {
          upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
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

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// `placeholder` + `clearButton` let optional colors fall back to the form's own.
export function ColorField({ label, value, onChange, placeholder, helpText }) {
  const swatchColor = HEX_PATTERN.test(value) ? value : "#ffffff";
  return (
    <TextField
      label={label}
      value={value || ""}
      onChange={onChange}
      autoComplete="off"
      monospaced
      placeholder={placeholder}
      helpText={helpText}
      clearButton={Boolean(placeholder)}
      onClearButtonClick={() => onChange("")}
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
