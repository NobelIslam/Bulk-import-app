import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "wholesale-application",
  name: "Wholesale application",
  category: "B2B",
  description: "Business details for store owners and stockists.",
  fieldsInPreview: 7,
  schema: {
    version: 1,
    fields: [
      heading("Wholesale application"),
      paragraph("We review every application and reply within three business days."),
      field("shortText", { key: "contactName", label: "Your name", required: true, width: "half" }),
      field("email", { key: "email", label: "Email address", required: true, width: "half" }),
      field("shortText", { key: "businessName", label: "Business name", required: true, width: "half" }),
      field("shortText", { key: "website", label: "Website or Instagram", placeholder: "https://", width: "half" }),
      field("shortText", { key: "city", label: "City", required: true, width: "third" }),
      field("shortText", { key: "region", label: "State / Region", required: true, width: "third" }),
      field("shortText", { key: "country", label: "Country", required: true, width: "third" }),
      field("number", {
        key: "stores",
        label: "How many stores do you run?",
        validation: { min: 1, max: 10000, minLength: null, maxLength: null, pattern: "", patternMessage: "" },
      }),
      field("multiCheckbox", {
        key: "productInterest",
        label: "What are you interested in?",
        required: true,
        options: ["Apparel", "Accessories", "Footwear", "Homeware"],
      }),
      field("longText", { key: "notes", label: "Tell us about your store" }),
      consent("I agree to be contacted about a wholesale account."),
      field("submitButton", { label: "Apply for wholesale" }),
    ],
    settings: {
      submitText: "Apply for wholesale",
      successMessage: "Application received. We'll be in touch within three business days.",
      notificationEmails: [],
    },
  },
};