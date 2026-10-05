import contact from "./contact";
import newsletter from "./newsletter";
import quoteRequest from "./quote-request";
import feedback from "./feedback";
import eventRegistration from "./event-registration";
import wholesaleApplication from "./wholesale-application";
import supportTicket from "./support-ticket";
import leadCapture from "./lead-capture";

// Registry of starter templates. Add a file here and list it below — the
// template picker, the create-form flow and the limits all read from this array.
export const TEMPLATES = [
  contact,
  newsletter,
  quoteRequest,
  feedback,
  eventRegistration,
  wholesaleApplication,
  supportTicket,
  leadCapture,
];

export const TEMPLATE_KEYS = TEMPLATES.map((template) => template.key);

export function getTemplate(key) {
  if (!key || key === "blank") return null;
  return TEMPLATES.find((template) => template.key === key) || null;
}

// Groups templates by category for the picker, preserving registry order.
export function getTemplateCategories() {
  const categories = [];
  TEMPLATES.forEach((template) => {
    let group = categories.find((entry) => entry.title === template.category);
    if (!group) {
      group = { title: template.category, templates: [] };
      categories.push(group);
    }
    group.templates.push(template);
  });
  return categories;
}