import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "event-registration",
  name: "Event registration",
  category: "Events",
  description: "Ticket details, attendee count and dietary notes.",
  fieldsInPreview: 6,
  schema: {
    version: 1,
    fields: [
      heading("Save your seat"),
      paragraph("We'll email your confirmation and joining details."),
      field("shortText", { key: "name", label: "Full name", required: true, width: "half" }),
      field("email", { key: "email", label: "Email address", required: true, width: "half" }),
      field("number", {
        key: "guests",
        label: "Number of guests",
        required: true,
        defaultValue: "1",
        validation: { min: 1, max: 20, minLength: null, maxLength: null, pattern: "", patternMessage: "" },
      }),
      field("dropdown", {
        key: "session",
        label: "Session",
        required: true,
        options: ["Morning workshop", "Afternoon workshop", "Evening panel"],
      }),
      field("multiCheckbox", {
        key: "dietary",
        label: "Dietary requirements",
        options: ["Vegetarian", "Vegan", "Gluten free", "No requirements"],
      }),
      field("longText", { key: "notes", label: "Anything else we should know?" }),
      consent("I agree to receive event updates by email."),
      field("submitButton", { label: "Register" }),
    ],
    settings: {
      submitText: "Register",
      successMessage: "You're registered. Check your inbox for the confirmation.",
      notificationEmails: [],
    },
  },
};