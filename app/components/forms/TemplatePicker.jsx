import { BlockStack, Box, Button, Grid, InlineStack, Text } from "@shopify/polaris";
import { getFieldType } from "../../forms/fields";

// Visual template picker shown when creating a form. Every card is a submit
// button for the surrounding <Form>, so selecting a template is a plain post
// with no client state.
export default function TemplatePicker({ categories, busy }) {
  return (
    <BlockStack gap="500">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodySm" tone="subdued">
          Pick a starting point. You can change every field afterwards.
        </Text>
        <Button submit name="templateKey" value="blank" disabled={busy}>
          Start from scratch
        </Button>
      </InlineStack>

      {categories.map((group) => (
        <BlockStack key={group.title} gap="300">
          <Text as="h2" variant="headingMd" tone="subdued">
            {group.title}
          </Text>
          <Grid columns={{ xs: 1, sm: 2, md: 3, lg: 4 }}>
            {group.templates.map((template) => (
              <Box key={template.key}>
                <TemplateCard template={template} disabled={busy} />
              </Box>
            ))}
          </Grid>
        </BlockStack>
      ))}
    </BlockStack>
  );
}

function TemplateCard({ template, disabled }) {
  return (
    <button
      type="submit"
      name="templateKey"
      value={template.key}
      disabled={disabled}
      style={{
        width: "100%",
        height: "100%",
        textAlign: "left",
        background: "#ffffff",
        border: "1px solid #e1e3e5",
        borderRadius: 12,
        padding: 12,
        cursor: disabled ? "default" : "pointer",
        font: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <TemplateThumb template={template} />
      <BlockStack gap="100">
        <Text as="h3" variant="headingSm">
          {template.name}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {template.description}
        </Text>
      </BlockStack>
    </button>
  );
}

// Schematic preview: one control per field, sized by its layout role.
function TemplateThumb({ template }) {
  const fields = (template.schema?.fields || []).slice(0, 8);
  return (
    <div
      aria-hidden="true"
      style={{
        background: "#f6f6f7",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        height: 110,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {fields.map((field) => {
          const meta = getFieldType(field.type);
          const width =
            field.width === "full" ? "100%" : field.width === "half" ? "calc(50% - 3px)" : "calc(33.333% - 4px)";
          return (
            <div key={field.id} style={{ width, display: "flex", flexDirection: "column", gap: 3 }}>
              {meta?.submissionKey !== false && field.type !== "submitButton" && (
                <div style={{ height: 4, width: "55%", borderRadius: 2, background: "#c9cccf" }} />
              )}
              <div
                style={{
                  height: 14,
                  borderRadius: 3,
                  background: field.type === "submitButton" ? "#8c9196" : "#ffffff",
                  border: "1px solid #e1e3e5",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}