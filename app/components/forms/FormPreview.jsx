import { useCallback, useId, useMemo, useState } from "react";
import { getFieldType, isConditionMet } from "../../forms/fields";
import { buildFormCss, resolveStyle, DEFAULT_DESKTOP_STYLE } from "../../forms/design";

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
  const css = buildFormCss({
    publicId: scopeId,
    desktop: desktopStyle || DEFAULT_DESKTOP_STYLE,
    mobile: mobileStyle,
    forceMobile: viewport === "mobile",
  });
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
    <div
      className={`tclf-card tclf-form--${scopeId}${style.alignment === "center" ? " tclf-align-center" : ""}`}
      data-input-style={style.inputStyle}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
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
    </div>
  );
}

export function spacingStyle(spacing) {
  if (!spacing) return undefined;
  const box = (entry) => `${entry?.top || 0}px ${entry?.right || 0}px ${entry?.bottom || 0}px ${entry?.left || 0}px`;
  return { margin: box(spacing.margin), padding: box(spacing.padding) };
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

  const isLabelled = !["checkbox", "consent", "submit", "heading", "paragraph", "divider", "hidden"].includes(meta.control);

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
    <div
      className={`tclf-col${field.cssClass ? ` ${field.cssClass}` : ""}`}
      data-width={field.width}
      data-field-id={field.id}
      hidden={hiddenByCondition || meta.control === "hidden" || undefined}
      style={spacingStyle(field.spacing)}
    >
      {content}
    </div>
  );
}

function noop() {}

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
      return <h3 className="tclf-heading">{field.label}</h3>;
    case "paragraph":
      return <p className="tclf-paragraph">{field.label}</p>;
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
      return <input {...shared} {...valueProps} type="date" />;
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
