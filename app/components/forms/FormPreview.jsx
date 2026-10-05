import { useId } from "react";
import { getFieldType } from "../../forms/fields";
import { buildFormCss, resolveStyle, DEFAULT_DESKTOP_STYLE } from "../../forms/design";

// Renders a form from its schema + design tokens. The builder preview uses this;
// the storefront runtime renders the same markup shape from the app proxy
// config, so what the merchant sees here is what visitors get.
export default function FormPreview({
  publicId,
  schema,
  desktopStyle,
  mobileStyle,
  viewport = "desktop",
  mode = "inline",
  interactive = false,
}) {
  const uid = useId().replace(/:/g, "");
  const scopeId = publicId || `preview${uid}`;
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const settings = schema?.settings || {};
  const style = resolveStyle(desktopStyle, mobileStyle, viewport);
  const css = buildFormCss({ publicId: scopeId, desktop: desktopStyle || DEFAULT_DESKTOP_STYLE, mobile: mobileStyle });

  const body = (
    <div
      className={`tclf-form--${scopeId}${style.alignment === "center" ? " tclf-align-center" : ""}`}
      data-input-style={style.inputStyle}
      style={{ textAlign: style.alignment }}
    >
      <div className="tclf-grid">
        {fields.map((field) => (
          <FormFieldPreview
            key={field.id}
            field={field}
            uid={uid}
            interactive={interactive}
            submitText={settings.submitText}
            buttonStyle={style.buttonStyle}
          />
        ))}
      </div>
    </div>
  );

  if (mode === "popup") {
    return (
      <div style={{ position: "relative", minHeight: 340 }}>
        <Style css={css} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: style.overlayColor,
            opacity: Number(style.overlayOpacity) / 100,
          }}
        />
        <div style={{ position: "relative", padding: "24px 0" }}>
          <div className={`tclf-card tclf-form--${scopeId}`}>
            <Style css={css} />
            {body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`tclf-card tclf-form--${scopeId}`}>
      <Style css={css} />
      {body}
    </div>
  );
}

// A single field, including its layout column. `bare` drops the column wrapper so
// the builder canvas can supply its own drag-and-drop chrome around it.
export function FormFieldPreview({ field, uid, interactive = false, submitText, buttonStyle, bare = false }) {
  const meta = getFieldType(field.type);
  if (!meta) return null;

  const inputId = `tclf-${uid}-${field.id}`;
  const describedBy = field.helpText ? `${inputId}-help` : undefined;
  const shared = {
    id: inputId,
    name: field.key || field.id,
    disabled: !interactive,
    "aria-describedby": describedBy,
  };

  const control = renderControl({ field, meta, shared, inputId, interactive, submitText, buttonStyle });

  const isLabelled =
    meta.control !== "checkbox" && meta.control !== "consent" && meta.control !== "submit";

  const content = (
    <>
      {isLabelled && (
        <label className="tclf-label" id={`${inputId}-label`} htmlFor={inputId}>
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
      {field.helpText && (
        <span className="tclf-help" id={describedBy}>
          {field.helpText}
        </span>
      )}
    </>
  );

  if (bare) return <>{content}</>;

  return (
    <div className="tclf-col" data-width={field.width} data-field-id={field.id}>
      {content}
    </div>
  );
}

function renderControl({ field, meta, shared, inputId, interactive, submitText, buttonStyle }) {
  switch (meta.control) {
    case "textarea":
      return <textarea {...shared} placeholder={field.placeholder} rows={4} defaultValue={field.defaultValue} />;
    case "select":
      return (
        <select {...shared} defaultValue={field.defaultValue}>
          <option value="">{field.placeholder || "Select…"}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "radio":
      return (
        <div className="tclf-choice-list" role="radiogroup" aria-labelledby={`${inputId}-label`}>
          {field.options.map((option) => (
            <label className="tclf-choice" key={option}>
              <input
                type="radio"
                name={field.key || field.id}
                value={option}
                disabled={!interactive}
                defaultChecked={field.defaultValue === option}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    case "checkboxGroup":
      return (
        <div className="tclf-choice-list">
          {field.options.map((option) => (
            <label className="tclf-choice" key={option}>
              <input
                type="checkbox"
                name={`${field.key || field.id}[]`}
                value={option}
                disabled={!interactive}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
    case "checkbox":
    case "consent":
      return (
        <label className="tclf-choice" htmlFor={inputId}>
          <input {...shared} type="checkbox" />
          <span>{field.label}</span>
        </label>
      );
    case "hidden":
      return <input {...shared} type="hidden" value={field.defaultValue} readOnly />;
    case "heading":
      return <h3 className="tclf-heading">{field.label}</h3>;
    case "paragraph":
      return <p className="tclf-paragraph">{field.label}</p>;
    case "submit":
      return (
        <button type="button" className="tclf-submit" data-button-style={buttonStyle} disabled={!interactive}>
          {field.label || submitText}
        </button>
      );
    case "number":
      return <input {...shared} type="number" placeholder={field.placeholder} defaultValue={field.defaultValue} />;
    case "date":
      return <input {...shared} type="date" defaultValue={field.defaultValue} />;
    case "tel":
      return <input {...shared} type="tel" placeholder={field.placeholder} defaultValue={field.defaultValue} />;
    case "email":
      return <input {...shared} type="email" placeholder={field.placeholder} defaultValue={field.defaultValue} />;
    case "file":
      return <input {...shared} type="file" />;
    default:
      return <input {...shared} type="text" placeholder={field.placeholder} defaultValue={field.defaultValue} />;
  }
}

// The CSS is generated from normalized design tokens only — never from merchant
// free text — so inlining it is safe.
function Style({ css }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
