import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "quote-request",
  name: "Quote request",
  category: "Sales",
  description: "Collect the details you need to scope a quote, with budget and timeline.",
  fieldsInPreview: 6,
  schema: {
    version: 1,
    fields: [
      heading("Request a quote"),
      paragraph("Share a few details and we'll come back with pricing."),
      field("shortText", { key: "name", label: "Your name", required: true, width: "half" }),
      field("email", { key: "email", label: "Work email", required: true, width: "half" }),
      field("shortText", { key: "company", label: "Company", width: "half" }),
      field("phone", { key: "phone", label: "Phone", width: "half" }),
      field("number", {
        key: "quantity",
        label: "Estimated quantity",
        required: true,
        validation: { min: 1, max: 1000000, minLength: null, maxLength: null, pattern: "", patternMessage: "" },
      }),
      field("dropdown", {
        key: "timeline",
        label: "Timeline",
        required: true,
        options: ["As soon as possible", "Within a month", "This quarter", "Just exploring"],
      }),
      field("longText", {
        key: "details",
        label: "Project details",
        required: true,
        placeholder: "What are you ordering, and anything we should know?",
      }),
      consent("I agree to be contacted about this quote."),
      field("submitButton", { label: "Request quote" }),
    ],
    settings: {
      submitText: "Request quote",
      successMessage: "Quote request received. We'll reply within one business day.",
      notificationEmails: [],
    },
  },
};