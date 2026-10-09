import { BlockStack, Checkbox, Divider, InlineStack, RangeSlider, Select, Text, TextField } from "@shopify/polaris";
import { LayoutColumn1Icon, LayoutColumns2Icon } from "@shopify/polaris-icons";
import { CUSTOM_CSS_MAX } from "../../forms/content";
import { AlignmentPicker, ColorField, ImagePicker, RichTextEditor } from "./ContentControls";

const SUCCESS_MODES = [
  { value: "message", label: "Show a thank-you message" },
  { value: "redirect", label: "Redirect to a page" },
];

const LAYOUTS = [
  { value: "single", label: "One column", description: "Fields only", Icon: LayoutColumn1Icon },
  { value: "twoColumn", label: "Two columns", description: "Image or content beside the fields", Icon: LayoutColumns2Icon },
];

const CSS_EXAMPLE = `/* Only applies to this form */
.tclf-submit { text-transform: uppercase; }
.tclf-label { letter-spacing: 0.02em; }
& { border: 2px solid #111; } /* & = the form card */`;

// Form-level settings: layout, submission behaviour, messages, notifications,
// spam and custom CSS.
export default function FormSettings({ settings, updateSetting, onLayoutChange, onError }) {
  const notificationEmails = (settings.notificationEmails || []).join(", ");
  const layout = settings.layout === "twoColumn" ? "twoColumn" : "single";
  const side = settings.sidePanel || {};
  const updateSide = (patch) => updateSetting({ sidePanel: { ...side, ...patch } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, overflowY: "auto" }}>
      <Text as="h2" variant="headingSm">
        Form settings
      </Text>

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Layout
        </Text>
        <div className="fb-layout-picker" role="radiogroup" aria-label="Form layout">
          {LAYOUTS.map(({ value, label, description, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={layout === value}
              className="fb-layout-option"
              onClick={() => (onLayoutChange ? onLayoutChange(value) : updateSetting({ layout: value }))}
            >
              <Icon width={28} height={28} fill="currentColor" aria-hidden="true" />
              <strong>{label}</strong>
              <span>{description}</span>
            </button>
          ))}
        </div>

        {layout === "twoColumn" && (
          <div className="fb-subcard">
            <span className="fb-subcard__title">Side column</span>
            <Select
              label="Position"
              options={[
                { value: "left", label: "Left of the form" },
                { value: "right", label: "Right of the form" },
              ]}
              value={side.position || "left"}
              onChange={(position) => updateSide({ position })}
            />
            <RangeSlider
              label="Column width"
              min={25}
              max={65}
              value={Number(side.width) || 45}
              output
              suffix={<span style={{ minWidth: 40, display: "inline-block", textAlign: "right" }}>{side.width || 45}%</span>}
              onChange={(width) => updateSide({ width })}
            />
            <ImagePicker
              label="Image"
              value={side.imageUrl}
              onChange={(imageUrl) => updateSide({ imageUrl })}
              onError={onError}
            />
            {side.imageUrl && (
              <>
                <TextField
                  label="Image alt text"
                  value={side.imageAlt || ""}
                  autoComplete="off"
                  onChange={(imageAlt) => updateSide({ imageAlt })}
                />
                <Select
                  label="Image fit"
                  options={[
                    { value: "cover", label: "Fill the column (background)" },
                    { value: "contain", label: "Show the whole image" },
                  ]}
                  value={side.imageFit || "cover"}
                  onChange={(imageFit) => updateSide({ imageFit })}
                />
              </>
            )}
            <RichTextEditor
              label="Content"
              value={side.content}
              onChange={(content) => updateSide({ content })}
            />
            <p className="fb-help" style={{ marginTop: -4 }}>
              Optional text shown in the side column, on top of the image when it fills the column.
            </p>
            <ColorField
              label="Background"
              value={side.backgroundColor}
              placeholder="#f6f6f7"
              onChange={(backgroundColor) => updateSide({ backgroundColor })}
            />
            <ColorField
              label="Text color"
              value={side.textColor}
              placeholder="Form default"
              onChange={(textColor) => updateSide({ textColor })}
            />
            <AlignmentPicker
              label="Text alignment"
              options={["left", "center", "right"]}
              value={side.textAlign || "left"}
              onChange={(textAlign) => updateSide({ textAlign })}
            />
            <Select
              label="Vertical position of content"
              options={[
                { value: "top", label: "Top" },
                { value: "center", label: "Middle" },
                { value: "bottom", label: "Bottom" },
              ]}
              value={side.verticalAlign || "center"}
              onChange={(verticalAlign) => updateSide({ verticalAlign })}
            />
            <p className="fb-help">On phones the side column stacks above the fields.</p>
          </div>
        )}
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Submission
        </Text>
        <TextField
          label="Submit button text"
          value={settings.submitText}
          autoComplete="off"
          onChange={(submitText) => updateSetting({ submitText })}
        />
        <Select
          label="After a successful submission"
          options={SUCCESS_MODES}
          value={settings.successMode}
          onChange={(successMode) => updateSetting({ successMode })}
        />
        {settings.successMode === "message" ? (
          <TextField
            label="Thank-you message"
            value={settings.successMessage}
            multiline
            rows={3}
            autoComplete="off"
            onChange={(successMessage) => updateSetting({ successMessage })}
          />
        ) : (
          <TextField
            label="Redirect URL"
            value={settings.redirectUrl}
            autoComplete="off"
            helpText="Visitors are sent here after a successful submission."
            onChange={(redirectUrl) => updateSetting({ redirectUrl })}
          />
        )}
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Error messages
        </Text>
        <TextField
          label="Required field"
          value={settings.errorRequired}
          autoComplete="off"
          onChange={(errorRequired) => updateSetting({ errorRequired })}
        />
        <TextField
          label="Invalid value"
          value={settings.errorInvalid}
          autoComplete="off"
          onChange={(errorInvalid) => updateSetting({ errorInvalid })}
        />
        <TextField
          label="Something went wrong"
          value={settings.errorSubmit}
          autoComplete="off"
          onChange={(errorSubmit) => updateSetting({ errorSubmit })}
        />
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Notifications
        </Text>
        <TextField
          label="Email new submissions to"
          value={notificationEmails}
          autoComplete="off"
          helpText="Comma-separated. Leave blank to skip notifications."
          onChange={(value) =>
            updateSetting({
              notificationEmails: value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
                .slice(0, 5),
            })
          }
        />
        <Checkbox
          label="Send an auto-reply to the person who submitted"
          checked={Boolean(settings.autoReplyEnabled)}
          onChange={(autoReplyEnabled) => updateSetting({ autoReplyEnabled })}
        />
        {settings.autoReplyEnabled && (
          <TextField
            label="Auto-reply message"
            value={settings.autoReplyMessage}
            multiline
            rows={3}
            autoComplete="off"
            helpText="Leave blank to send the thank-you message above."
            onChange={(autoReplyMessage) => updateSetting({ autoReplyMessage })}
          />
        )}
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Spam protection
        </Text>
        <Checkbox
          label="Use a honeypot field"
          checked={Boolean(settings.honeypotEnabled)}
          helpText="Adds a hidden field that only bots fill in. No impact on visitors."
          onChange={(honeypotEnabled) => updateSetting({ honeypotEnabled })}
        />
        <InlineStack gap="200">
          <TextField
            label="Submissions per minute"
            type="number"
            value={String(settings.rateLimitPerMinute ?? 5)}
            autoComplete="off"
            onChange={(value) => updateSetting({ rateLimitPerMinute: Number(value) || 5 })}
          />
        </InlineStack>
        <Checkbox
          label="Use reCAPTCHA v3"
          checked={Boolean(settings.recaptchaEnabled)}
          onChange={(recaptchaEnabled) => updateSetting({ recaptchaEnabled })}
        />
        {settings.recaptchaEnabled && (
          <TextField
            label="reCAPTCHA site key"
            value={settings.recaptchaSiteKey}
            autoComplete="off"
            onChange={(recaptchaSiteKey) => updateSetting({ recaptchaSiteKey })}
          />
        )}
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Shopify customer
        </Text>
        <Checkbox
          label="Create or update a customer from the email field"
          checked={Boolean(settings.createCustomer)}
          onChange={(createCustomer) => updateSetting({ createCustomer })}
        />
        <Text as="p" variant="bodySm" tone="subdued">
          Adds the submitter to your Shopify customers with a “Form submitted” tag. Only the email and name fields are
          used.
        </Text>
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Custom CSS
        </Text>
        <TextField
          label="CSS for this form"
          labelHidden
          value={settings.customCss || ""}
          multiline={8}
          monospaced
          autoComplete="off"
          spellCheck={false}
          maxLength={CUSTOM_CSS_MAX}
          placeholder={CSS_EXAMPLE}
          onChange={(customCss) => updateSetting({ customCss })}
          helpText="Applied only to this form, in the builder preview and on your store. Selectors are scoped automatically; use & to target the form card itself."
        />
      </BlockStack>
    </div>
  );
}