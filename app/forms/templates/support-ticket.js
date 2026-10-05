import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "support-ticket",
  name: "Support ticket",
  category: "Support",
  description: "Structured help requests with order context and priority.",
  fieldsInPreview: 6,
  schema: {
    version: 1,
    fields: [
      heading("How can we help?"),
      paragraph("Include your order number so we can find the details faster."),
      field("shortText", { key: "orderNumber", label: "Order number", width: "half" }),
      field("email", { key: "email", label: "Email address", required: true, width: "half" }),
      field("dropdown", {
        key: "category",
        label: "Request type",
        required: true,
        options: ["Order issue", "Return or exchange", "Shipping delay", "Product question", "Other"],
      }),
      field("radio", {
        key: "priority",
        label: "How urgent is this?",
        options: ["Low", "Normal", "High"],
      }),
      field("fileUpload", {
        key: "attachment",
        label: "Attach a photo or document",
        helpText: "Optional. PDF, images or documents up to 25 MB.",
      }),
      field("longText", { key: "description", label: "Describe the issue", required: true }),
      consent("I agree to the store contacting me about this request."),
      field("submitButton", { label: "Submit request" }),
    ],
    settings: {
      submitText: "Submit request",
      successMessage: "Request received. Our support team will reply by email.",
      notificationEmails: [],
    },
  },
};