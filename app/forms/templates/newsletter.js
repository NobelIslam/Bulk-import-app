import { field, heading, consent } from "./_helpers";

export default {
  key: "newsletter",
  name: "Newsletter signup",
  category: "Grow your list",
  description: "One email field and a consent checkbox — the highest-converting signup there is.",
  fieldsInPreview: 3,
  schema: {
    version: 1,
    fields: [
      heading("Join the list"),
      field("email", {
        key: "email",
        label: "Email address",
        required: true,
        width: "full",
        placeholder: "you@example.com",
        validation: { minLength: null, maxLength: null, min: null, max: null, pattern: "", patternMessage: "" },
      }),
      field("checkbox", { key: "firstOrder", label: "Send me a discount code for my first order" }),
      consent("I agree to receive marketing emails and can unsubscribe at any time."),
      field("submitButton", { label: "Subscribe" }),
    ],
    settings: {
      submitText: "Subscribe",
      successMessage: "You're on the list. Welcome aboard.",
      notificationEmails: [],
    },
  },
  desktopStyle: {
    backgroundColor: "#f6f6f7",
    padding: 32,
    alignment: "center",
    formWidth: 520,
  },
};