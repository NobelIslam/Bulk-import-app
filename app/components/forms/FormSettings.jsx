import { BlockStack, Checkbox, Divider, InlineStack, Select, Text, TextField } from "@shopify/polaris";

const SUCCESS_MODES = [
  { value: "message", label: "Show a thank-you message" },
  { value: "redirect", label: "Redirect to a page" },
];

// Form-level settings: submission behaviour, messages, notifications and spam.
export default function FormSettings({ settings, updateSetting }) {
  const notificationEmails = (settings.notificationEmails || []).join(", ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, overflowY: "auto" }}>
      <Text as="h2" variant="headingSm">
        Form settings
      </Text>

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
    </div>
  );
}