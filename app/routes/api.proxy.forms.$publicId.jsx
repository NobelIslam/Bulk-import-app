import crypto from "node:crypto";
import { authenticate } from "../shopify.server";
import { getPublishedForm, createSubmission, countSubmissionsThisMonth } from "../forms/forms.server";
import { checkSubmissionLimit } from "../config/limits.server";
import { isHoneypotTripped, validateSubmission } from "../forms/schema.server";
import { buildFormCss } from "../forms/design";
import { normalizeSchema } from "../forms/fields";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}

function hashIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  // eslint-disable-next-line no-undef
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SESSION_SECRET || "form-rate-limit";
  return crypto.createHash("sha256").update(`${ip}:${secret}`).digest("hex").slice(0, 64);
}

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : {};
  }
  const formData = await request.formData();
  const values = {};
  for (const [key, value] of formData.entries()) {
    if (key.endsWith("[]")) {
      const normalized = key.slice(0, -2);
      values[normalized] = Array.isArray(values[normalized]) ? [...values[normalized], value] : [value];
    } else {
      values[key] = value;
    }
  }
  return values;
}

export async function loader({ request, params }) {
  const context = await authenticate.public.appProxy(request);
  const shop = context.session?.shop;
  if (!shop) return json({ error: "This form is not available." }, { status: 401 });

  const form = await getPublishedForm(shop, params.publicId);
  if (!form) return json({ error: "Form not found." }, { status: 404 });

  // Re-normalizing fills defaults for forms saved before newer options existed
  // and re-sanitizes rich text before it reaches the storefront.
  const normalized = normalizeSchema(form.schema);
  const schema = {
    ...normalized,
    fields: normalized.fields.filter((field) => field.visible !== false),
  };

  return json({
    form: {
      publicId: form.publicId,
      name: form.name,
      schema,
      desktopStyle: form.desktopStyle,
      mobileStyle: form.mobileStyle,
      placement: form.placement,
    },
    // Same generator the builder preview uses, so the storefront matches it exactly.
    css: buildFormCss({
      publicId: form.publicId,
      desktop: form.desktopStyle,
      mobile: form.mobileStyle,
      settings: schema.settings,
    }),
  });
}

export async function action({ request, params }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, { status: 405 });
  }

  const context = await authenticate.public.appProxy(request);
  const shop = context.session?.shop;
  if (!shop) return json({ error: "This form is not available." }, { status: 401 });

  const form = await getPublishedForm(shop, params.publicId);
  if (!form) return json({ error: "Form not found." }, { status: 404 });

  const monthlyCount = await countSubmissionsThisMonth(shop);
  const limitError = checkSubmissionLimit(monthlyCount);
  if (limitError) return json({ error: limitError }, { status: 429 });

  const payload = await readPayload(request);
  if (isHoneypotTripped(payload, form.schema)) {
    return json({ ok: true, message: form.schema?.settings?.successMessage || "Thanks!" });
  }

  const result = validateSubmission(form.schema, payload);
  if (!result.isValid) {
    return json({ ok: false, errors: result.errors }, { status: 422 });
  }

  await createSubmission({
    shop,
    formId: form.id,
    data: result.values,
    meta: {
      pageUrl: typeof payload.__pageUrl === "string" ? payload.__pageUrl.slice(0, 2000) : "",
      referer: request.headers.get("referer")?.slice(0, 2000) || "",
      userAgent: request.headers.get("user-agent")?.slice(0, 500) || "",
      source: "app-proxy",
    },
    ipHash: hashIp(request),
  });

  return json({ ok: true, message: form.schema?.settings?.successMessage || "Thanks!" });
}

export const headers = ({ loaderHeaders }) => loaderHeaders;
