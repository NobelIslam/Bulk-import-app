import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { getFieldType, isConditionMet } from "../../forms/fields";
import { buildFormCss, resolveStyle, DEFAULT_DESKTOP_STYLE } from "../../forms/design";
import {
  addDays,
  formatDate,
  isDateAllowed,
  MONTH_NAMES,
  monthGrid,
  normalizeDateOptions,
  parseIsoDate,
  todayIso,
  weekdayLabels,
} from "../../forms/content";

// Renders a form from its schema + design tokens. The storefront runtime emits
// the same markup and the same generated CSS, so what the merchant sees here
// is what visitors get.
export default function FormPreview({
  publicId,
  schema,
  desktopStyle,
  mobileStyle,
  viewport = "desktop",
  interactive = false,
  onSubmitPreview,
}) {
  const uid = useId().replace(/:/g, "");
  const scopeId = publicId || `preview${uid}`;
  const fields = useMemo(() => (Array.isArray(schema?.fields) ? schema.fields : []), [schema]);
  const settings = schema?.settings || {};
  const style = resolveStyle(desktopStyle, mobileStyle, viewport);
  const [values, setValues] = useState({});

  const collect = useCallback(
    (formElement) => {
      const next = {};
      fields.forEach((field) => {
        if (!field.key) return;
        const inputs = formElement.querySelectorAll(`[name="${CSS.escape(field.key)}"], [name="${CSS.escape(`${field.key}[]`)}"]`);
        if (field.type === "multiCheckbox") {
          next[field.key] = [...inputs].filter((input) => input.checked).map((input) => input.value);
        } else if (field.type === "checkbox" || field.type === "consentCheckbox") {
          next[field.key] = Boolean(inputs[0]?.checked);
        } else if (field.type === "radio") {
          next[field.key] = [...inputs].find((input) => input.checked)?.value || "";
        } else {
          next[field.key] = inputs[0]?.value || "";
        }
      });
      setValues(next);
    },
    [fields],
  );

  return (
    <FormShell
      scopeId={scopeId}
      desktopStyle={desktopStyle}
      mobileStyle={mobileStyle}
      settings={settings}
      viewport={viewport}
    >
      <form
        className="tclf-grid"
        noValidate
        onChange={interactive ? (event) => collect(event.currentTarget) : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitPreview?.();
        }}
      >
        {fields.map((field) => (
          <FormFieldPreview
            key={field.id}
            field={field}
            uid={uid}
            interactive={interactive}
            submitText={settings.submitText}
            buttonStyle={style.buttonStyle}
            hiddenByCondition={interactive && !isConditionMet(field, fields, values)}
          />
        ))}
      </form>
    </FormShell>
  );
}

// The card, its scoped stylesheet and the one/two column layout around the
// fields. The builder canvas wraps its sortable list in the same shell, so the
// Build tab shows exactly what the Design tab and storefront show.
export function FormShell({ scopeId, desktopStyle, mobileStyle, settings, viewport = "desktop", children }) {
  const style = resolveStyle(desktopStyle, mobileStyle, viewport);
  const css = buildFormCss({
    publicId: scopeId,
    desktop: desktopStyle || DEFAULT_DESKTOP_STYLE,
    mobile: mobileStyle,
    settings,
    forceMobile: viewport === "mobile",
  });
  const twoColumn = settings?.layout === "twoColumn";
  const side = settings?.sidePanel || {};

  return (
    <div
      className={`tclf-card tclf-form--${scopeId}${style.alignment === "center" ? " tclf-align-center" : ""}`}
      data-input-style={style.inputStyle}
      data-layout={twoColumn ? "twoColumn" : "single"}
      data-side-position={side.position === "right" ? "right" : "left"}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="tclf-layout">
        {twoColumn && <SidePanel side={side} />}
        <div className="tclf-main">{children}</div>
      </div>
    </div>
  );
}

export function SidePanel({ side }) {
  return (
    <aside className="tclf-side" data-fit={side.imageFit || "cover"} data-valign={side.verticalAlign || "center"}>
      {side.imageUrl && <img className="tclf-side__img" src={side.imageUrl} alt={side.imageAlt || ""} />}
      {/* Rich text is sanitized by normalizeSidePanel() before it is stored or previewed. */}
      <div className="tclf-side__content tclf-rich" dangerouslySetInnerHTML={{ __html: side.content || "" }} />
    </aside>
  );
}

export function spacingStyle(spacing) {
  if (!spacing) return undefined;
  const box = (entry) => `${entry?.top || 0}px ${entry?.right || 0}px ${entry?.bottom || 0}px ${entry?.left || 0}px`;
  return { margin: box(spacing.margin), padding: box(spacing.padding) };
}

function hasPadding(spacing) {
  const padding = spacing?.padding || {};
  return ["top", "right", "bottom", "left"].some((side) => Number(padding[side]) > 0);
}

// Attributes of a field's layout column, shared by the preview and the canvas
// so a field looks the same in both. Mirrored by colAttrs() in tcl-forms.js.
export function columnProps(field) {
  const block = field.blockStyle || {};
  const style = { ...(spacingStyle(field.spacing) || {}) };
  // A colored block with no explicit padding gets the stylesheet's default.
  if (block.backgroundColor && !hasPadding(field.spacing)) delete style.padding;
  if (block.backgroundColor) style.background = block.backgroundColor;
  if (block.textColor) style.color = block.textColor;
  if (block.align && field.type !== "image") style.textAlign = block.align;
  return {
    className: `tclf-col${field.cssClass ? ` ${field.cssClass}` : ""}`,
    "data-width": field.width,
    "data-field-id": field.id,
    "data-block-bg": block.backgroundColor ? "" : undefined,
    "data-has-padding": hasPadding(field.spacing) ? "" : undefined,
    style,
  };
}

// A single field, including its layout column. `bare` drops the column wrapper so
// the builder canvas can supply its own drag-and-drop chrome around it.
export function FormFieldPreview({
  field,
  uid,
  interactive = false,
  submitText,
  buttonStyle,
  bare = false,
  hiddenByCondition = false,
}) {
  const meta = getFieldType(field.type);
  if (!meta) return null;
  if (!bare && field.visible === false) return null;

  const inputId = `tclf-${uid}-${field.id}`;
  const describedBy = field.helpText ? `${inputId}-help` : undefined;
  const shared = {
    id: inputId,
    name: field.key || field.id,
    tabIndex: interactive ? undefined : -1,
    required: interactive ? field.required : undefined,
    "aria-describedby": describedBy,
  };

  const control = renderControl({ field, meta, shared, inputId, interactive, submitText, buttonStyle });

  const isLabelled = !["checkbox", "consent", "submit", "heading", "paragraph", "divider", "hidden", "image"].includes(meta.control);

  const content = (
    <>
      {isLabelled && (
        <label
          className={`tclf-label${field.hideLabel ? " tclf-sr-only" : ""}`}
          id={`${inputId}-label`}
          htmlFor={inputId}
        >
          {field.label}
          {field.required && (
            <span className="tclf-required" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      {control}
      {field.helpText && meta.control !== "hidden" && (
        <span className="tclf-help" id={describedBy}>
          {field.helpText}
        </span>
      )}
    </>
  );

  if (bare) return content;

  return (
    <div {...columnProps(field)} hidden={hiddenByCondition || meta.control === "hidden" || undefined}>
      {content}
    </div>
  );
}

function noop() {}

function RichText({ as: Tag, className, html, fallback }) {
  // Rich text is sanitized by normalizeSchema() before it is stored, and by the
  // editor on every keystroke, so only allowlisted tags ever reach here.
  return <Tag className={`${className} tclf-rich`} dangerouslySetInnerHTML={{ __html: html || fallback || "" }} />;
}

function escapeText(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ImageBlock({ image }) {
  const data = image || {};
  const justify = { left: "flex-start", right: "flex-end" }[data.align] || "center";
  if (!data.url) {
    return <div className="tclf-image-empty">Add an image URL or upload an image in the settings panel</div>;
  }
  const img = (
    <img
      src={data.url}
      alt={data.alt || ""}
      loading="lazy"
      style={{ width: `${data.width || 100}%`, borderRadius: data.radius ? `${data.radius}px` : undefined }}
    />
  );
  return (
    <div className="tclf-image" style={{ justifyContent: justify }}>
      {data.link ? (
        <a href={data.link} target="_blank" rel="noopener noreferrer" tabIndex={-1} style={{ display: "contents" }}>
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  );
}

function renderControl({ field, meta, shared, inputId, interactive, submitText, buttonStyle }) {
  const options = Array.isArray(field.options) ? field.options : [];
  const valueProps = interactive
    ? { defaultValue: field.defaultValue }
    : { value: field.defaultValue || "", readOnly: true, onChange: noop };
  switch (meta.control) {
    case "textarea":
      return <textarea {...shared} {...valueProps} placeholder={field.placeholder} rows={4} />;
    case "select":
      return (
        <select
          {...shared}
          {...(interactive ? { defaultValue: field.defaultValue || "" } : { value: field.defaultValue || "", onChange: noop })}
        >
          <option value="">{field.placeholder || "Select…"}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="tclf-choice-list" role="radiogroup" aria-labelledby={`${inputId}-label`}>
          {options.map((option) => (
            <label className="tclf-choice" key={option}>
              <input
                type="radio"
                name={field.key || field.id}
                value={option}
                tabIndex={shared.tabIndex}
                {...(interactive
                  ? { defaultChecked: field.defaultValue === option }
                  : { checked: field.defaultValue === option, onChange: noop })}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    case "checkboxGroup":
      return (
        <div className="tclf-choice-list" role="group" aria-labelledby={`${inputId}-label`}>
          {options.map((option) => (
            <label className="tclf-choice" key={option}>
              <input type="checkbox" name={`${field.key || field.id}[]`} value={option} tabIndex={shared.tabIndex} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    case "checkbox":
    case "consent":
      return (
        <label className="tclf-choice" htmlFor={inputId}>
          <input
            {...shared}
            type="checkbox"
            {...(interactive
              ? { defaultChecked: field.defaultValue === "true" }
              : { checked: field.defaultValue === "true", onChange: noop })}
          />
          <span>
            {field.label}
            {field.required && (
              <span className="tclf-required" aria-hidden="true">
                {" "}
                *
              </span>
            )}
          </span>
        </label>
      );
    case "hidden":
      return <input {...shared} type="hidden" value={field.defaultValue || ""} readOnly />;
    case "heading":
      return (
        <RichText
          as={["h2", "h3", "h4"].includes(field.headingLevel) ? field.headingLevel : "h3"}
          className="tclf-heading"
          html={field.richText}
          fallback={escapeText(field.label)}
        />
      );
    case "paragraph":
      return <RichText as="div" className="tclf-paragraph" html={field.richText} fallback={escapeText(field.label)} />;
    case "image":
      return <ImageBlock image={field.image} />;
    case "divider":
      return <hr className="tclf-divider" />;
    case "submit":
      return (
        <button
          type={interactive ? "submit" : "button"}
          className="tclf-submit"
          data-button-style={buttonStyle}
          tabIndex={shared.tabIndex}
        >
          {field.label || submitText}
        </button>
      );
    case "number":
      return <input {...shared} {...valueProps} type="number" placeholder={field.placeholder} />;
    case "date":
      return <DatePicker field={field} shared={shared} interactive={interactive} />;
    case "tel":
      return <input {...shared} {...valueProps} type="tel" placeholder={field.placeholder} />;
    case "email":
      return <input {...shared} {...valueProps} type="email" placeholder={field.placeholder} />;
    case "file":
      return <input {...shared} type="file" />;
    default:
      return <input {...shared} {...valueProps} type="text" placeholder={field.placeholder} />;
  }
}

// ─── Date picker ─────────────────────────────────────────────────────────────
// React twin of the calendar in extensions/tcl-forms/assets/tcl-forms.js. Both
// emit the same markup so the generated CSS styles them identically.

function CalendarIcon() {
  return (
    <svg className="tclf-date__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4" strokeLinecap="round" />
    </svg>
  );
}

function DatePicker({ field, shared, interactive }) {
  const options = normalizeDateOptions(field.dateOptions);
  const initial = parseIsoDate(field.defaultValue) ? field.defaultValue : "";
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const hiddenRef = useRef(null);

  useEffect(() => {
    if (!interactive) setValue(initial);
  }, [initial, interactive]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    // Lets the preview's form-level onChange re-run conditional logic.
    hiddenRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [value]);

  const choose = (iso) => {
    picked.current = true;
    setValue(iso);
    setOpen(false);
    wrapperRef.current?.querySelector(".tclf-date__input")?.focus();
  };

  return (
    <div className="tclf-date" ref={wrapperRef}>
      <input
        id={shared.id}
        type="text"
        className="tclf-date__input"
        readOnly
        tabIndex={shared.tabIndex}
        placeholder={field.placeholder || options.format}
        value={formatDate(value, options.format)}
        role="combobox"
        aria-controls={`${shared.id}-cal`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={shared["aria-describedby"]}
        onClick={interactive ? () => setOpen((current) => !current) : undefined}
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
      />
      <CalendarIcon />
      <input ref={hiddenRef} type="hidden" name={shared.name} value={value} />
      {interactive && open && (
        <Calendar id={`${shared.id}-cal`} value={value} options={options} onSelect={choose} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function Calendar({ id, value, options, onSelect, onClose }) {
  const today = todayIso();
  const start = parseIsoDate(value) || parseIsoDate(today);
  const [view, setView] = useState({ year: start.year, month: start.month });
  const [focused, setFocused] = useState(value || today);
  const gridRef = useRef(null);

  useEffect(() => {
    gridRef.current?.querySelector(`[data-iso="${focused}"]`)?.focus();
  }, [focused, view]);

  const shift = (delta) => {
    setView(({ year, month }) => {
      const next = new Date(Date.UTC(year, month - 1 + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
    });
  };

  const moveFocus = (delta) => {
    const next = addDays(focused, delta);
    const parts = parseIsoDate(next);
    setFocused(next);
    if (parts.month !== view.month || parts.year !== view.year) setView({ year: parts.year, month: parts.month });
  };

  const onKeyDown = (event) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[event.key]) {
      event.preventDefault();
      moveFocus(moves[event.key]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const days = monthGrid(view.year, view.month, options.weekStart);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div id={id} className="tclf-cal" role="dialog" aria-label="Choose a date" onKeyDown={onKeyDown}>
      <div className="tclf-cal__head">
        <button type="button" className="tclf-cal__nav" aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <span className="tclf-cal__title" aria-live="polite">
          {MONTH_NAMES[view.month - 1]} {view.year}
        </span>
        <button type="button" className="tclf-cal__nav" aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="tclf-cal__grid" role="grid" ref={gridRef}>
        {weekdayLabels(options.weekStart).map((label) => (
          <span key={label} className="tclf-cal__dow" role="columnheader">
            {label}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            role="gridcell"
            className="tclf-cal__day"
            data-iso={day.iso}
            data-outside={day.outside ? "" : undefined}
            data-today={day.iso === today ? "" : undefined}
            aria-selected={day.iso === value}
            tabIndex={day.iso === focused ? 0 : -1}
            disabled={!isDateAllowed(day.iso, options)}
            onClick={() => onSelect(day.iso)}
          >
            {day.day}
          </button>
        ))}
      </div>
      <div className="tclf-cal__foot">
        <button type="button" className="tclf-cal__link" onClick={() => onSelect("")}>
          Clear
        </button>
        <button
          type="button"
          className="tclf-cal__link"
          disabled={!isDateAllowed(today, options)}
          onClick={() => onSelect(today)}
        >
          Today
        </button>
      </div>
    </div>
  );
}
