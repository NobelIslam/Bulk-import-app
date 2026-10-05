import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "contact",
  name: "Contact form",
  category: "Get in touch",
  description: "Name, email and a message. The safe default for most stores.",
  fieldsInPreview: 5,
  schema: {
    version: 1,
    fields: [
      heading("Get in touch"),
      paragraph("Tell us what you need and we'll reply within one business day."),
      field("shortText", { key: "name", label: "Your name", required: true, width: "half" }),
      field("email", { key: "email", label: "Email address", required: true, width: "half" }),
      field("dropdown", {
        key: "topic",
        label: "How can we help?",
        required: true,
        options: ["Order status", "Returns", "Product question", "Something else"],
      }),
      field("longText", {
        key: "message",
        label: "Message",
        required: true,
        placeholder: "Include your order number if you have one.",
        validation: { minLength: 10, maxLength: 2000, min: null, max: null, pattern: "", patternMessage: "" },
      }),
      consent("I agree to the store contacting me about my enquiry."),
      field("submitButton", { label: "Send message" }),
    ],
    settings: {
      submitText: "Send message",
      successMessage: "Thanks for reaching out — we'll be in touch shortly.",
      notificationEmails: [],
    },
  },
};