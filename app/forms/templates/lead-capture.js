import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "lead-capture",
  name: "Lead capture",
  category: "Marketing",
  description: "Compact popup capture with a hidden source field for attribution.",
  fieldsInPreview: 5,
  schema: {
    version: 1,
    fields: [
      heading("Get 10% off your first order"),
      paragraph("Join the list and we'll send your code straight away."),
      field("email", {
        key: "email",
        label: "Email address",
        required: true,
        width: "full",
        validation: { minLength: null, maxLength: null, min: null, max: null, pattern: "", patternMessage: "" },
      }),
      field("hiddenField", { key: "utm_source", label: "utm_source", defaultValue: "" }),
      field("hiddenField", { key: "page_path", label: "page_path", defaultValue: "" }),
      consent("I agree to receive marketing emails. Unsubscribe any time."),
      field("submitButton", { label: "Send my code" }),
    ],
    settings: {
      submitText: "Send my code",
      successMessage: "Check your inbox — your code is on the way.",
      notificationEmails: [],
    },
  },
  placement: {
    mode: "popup",
    openMode: "modal",
    triggers: [{ type: "delay", delayMs: 5000 }],
    targets: { mode: "all", urls: [] },
  },
};