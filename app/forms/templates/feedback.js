import { field, heading, paragraph, consent } from "./_helpers";

export default {
  key: "feedback",
  name: "Feedback survey",
  category: "Improve your store",
  description: "Rating plus open comments, shown after a purchase.",
  fieldsInPreview: 5,
  schema: {
    version: 1,
    fields: [
      heading("How did we do?"),
      paragraph("Your feedback goes straight to our team."),
      field("radio", {
        key: "rating",
        label: "Rate your experience",
        required: true,
        options: ["Excellent", "Good", "Okay", "Poor", "Terrible"],
      }),
      field("dropdown", {
        key: "reason",
        label: "What influenced your rating?",
        options: ["Product quality", "Shipping speed", "Packaging", "Customer support", "Price"],
      }),
      field("longText", { key: "comment", label: "Anything we could do better?", required: true }),
      consent("I agree to my feedback being shared with the store team."),
      field("submitButton", { label: "Send feedback" }),
    ],
    settings: {
      submitText: "Send feedback",
      successMessage: "Thanks for the feedback — it helps us get better.",
      notificationEmails: [],
    },
  },
};