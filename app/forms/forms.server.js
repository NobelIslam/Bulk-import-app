import db from "../db.server";
import {
  emptySchema,
  defaultPlacement,
  inputFields,
  normalizeSchema,
  slugifyKey,
} from "./fields";
import { defaultMobileStyle, defaultStyle, normalizeStyle } from "./design";
import { createPublicId } from "./schema.server";
import { checkFieldLimit, checkFormLimit } from "../config/limits.server";

// All reads and writes are scoped by `shop`. The shop domain always comes from
// the authenticated session (or from the App Proxy lookup), never from input.

const FORM_STATUS = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
};

export async function listForms(shop) {
  return db.form.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      publicId: true,
      templateKey: true,
      placement: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { submissions: true } },
    },
  });
}

export async function countForms(shop) {
  return db.form.count({ where: { shop } });
}

export async function getForm(shop, formId) {
  return db.form.findFirst({ where: { id: formId, shop } });
}

export async function getFormByPublicId(shop, publicId) {
  return db.form.findFirst({ where: { shop, publicId } });
}

function uniquePublicId() {
  // Collisions are astronomically unlikely at 12 chars, but the column is
  // unique so a retry keeps creation safe.
  return createPublicId();
}

export async function createForm(shop, { name, template }) {
  const limitError = checkFormLimit(await countForms(shop));
  if (limitError) {
    return { error: limitError };
  }

  const schema = template?.schema ? normalizeSchema(template.schema) : emptySchema();
  const fieldError = checkFieldLimit(schema.fields.length);
  if (fieldError) {
    return { error: fieldError };
  }

  return db.form.create({
    data: {
      shop,
      publicId: uniquePublicId(),
      name: String(name || template?.name || "Untitled form").slice(0, 120),
      status: FORM_STATUS.DRAFT,
      templateKey: template?.key ? String(template.key).slice(0, 60) : null,
      schema,
      desktopStyle: { ...defaultStyle(), ...(template?.desktopStyle || {}) },
      mobileStyle: { ...defaultMobileStyle(), ...(template?.mobileStyle || {}) },
      placement: { ...defaultPlacement(), ...(template?.placement || {}) },
    },
  });
}

export async function updateForm(shop, formId, patch) {
  const existing = await getForm(shop, formId);
  if (!existing) return null;

  const data = {};

  if (patch.name !== undefined) data.name = String(patch.name).trim().slice(0, 120) || existing.name;
  if (patch.schema !== undefined) {
    const schema = normalizeSchema(patch.schema);
    const fieldError = checkFieldLimit(schema.fields.length);
    if (fieldError) return { error: fieldError };
    data.schema = schema;
  }
  if (patch.desktopStyle !== undefined) data.desktopStyle = normalizeStyle(patch.desktopStyle);
  if (patch.mobileStyle !== undefined) {
    // Mobile stays sparse so unset keys fall back to the desktop value.
    data.mobileStyle = normalizeStyle(patch.mobileStyle, {});
  }
  if (patch.placement !== undefined) data.placement = { ...existing.placement, ...patch.placement };

  if (Object.keys(data).length === 0) return existing;

  // Ownership was verified by getForm(shop, formId). Prisma's update selector
  // must use a unique field, so update by id only after that check.
  return db.form.update({ where: { id: formId }, data });
}

export async function setFormStatus(shop, formId, status) {
  const nextStatus = status === FORM_STATUS.PUBLISHED ? FORM_STATUS.PUBLISHED : FORM_STATUS.DRAFT;
  const existing = await getForm(shop, formId);
  if (!existing) return null;

  return db.form.update({
    where: { id: formId },
    data: {
      status: nextStatus,
      publishedAt: nextStatus === FORM_STATUS.PUBLISHED ? new Date() : null,
    },
  });
}

export async function deleteForm(shop, formId) {
  // Submissions cascade via the relation's onDelete.
  const result = await db.form.deleteMany({ where: { id: formId, shop } });
  return result.count > 0;
}

export async function duplicateForm(shop, formId) {
  const source = await getForm(shop, formId);
  if (!source) return null;

  const limitError = checkFormLimit(await countForms(shop));
  if (limitError) return { error: limitError };

  const schema = normalizeSchema(source.schema);
  // Keys must stay unique inside the copy, exactly like a hand-made duplicate.
  const takenKeys = [];
  schema.fields = schema.fields.map((field) => {
    const next = { ...field };
    if (next.key) {
      next.key = slugifyKey(next.key, takenKeys);
      takenKeys.push(next.key);
    }
    return next;
  });

  return db.form.create({
    data: {
      shop,
      publicId: uniquePublicId(),
      name: `${source.name} (copy)`.slice(0, 120),
      status: FORM_STATUS.DRAFT,
      templateKey: source.templateKey,
      schema,
      desktopStyle: source.desktopStyle,
      mobileStyle: source.mobileStyle,
      placement: source.placement,
    },
  });
}

export async function renameForm(shop, formId, name) {
  return updateForm(shop, formId, { name });
}

// ─── Storefront-facing helpers ───────────────────────────────────────────────

// Only published forms are ever served to the storefront.
export async function getPublishedForm(shop, publicId) {
  const form = await db.form.findFirst({
    where: { shop, publicId, status: FORM_STATUS.PUBLISHED },
    include: { _count: { select: { submissions: true } } },
  });
  if (!form) return null;
  return { ...form, submissionCount: form._count.submissions };
}

// Submissions are counted for the builder's "N submissions" readout.
export async function getFormSubmissionCounts(shop) {
  const grouped = await db.submission.groupBy({
    by: ["formId"],
    where: { shop },
    _count: { _all: true },
  });
  return grouped.reduce((acc, row) => {
    acc[row.formId] = row._count._all;
    return acc;
  }, {});
}

export function getFormInputCount(form) {
  return inputFields(form?.schema).length;
}

export { FORM_STATUS };

export async function countSubmissionsThisMonth(shop) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return db.submission.count({
    where: { shop, createdAt: { gte: start } },
  });
}

export async function createSubmission({ shop, formId, data, meta, ipHash }) {
  const form = await db.form.findFirst({
    where: { id: formId, shop, status: FORM_STATUS.PUBLISHED },
    select: { id: true },
  });
  if (!form) return null;

  return db.submission.create({
    data: {
      shop,
      formId: form.id,
      data,
      meta: meta || {},
      ipHash: ipHash || null,
    },
  });
}

function submissionsWhere(shop, { formId, search, from, to } = {}) {
  return {
    shop,
    ...(formId ? { formId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { data: { string_contains: search } },
            { meta: { string_contains: search } },
          ],
        }
      : {}),
  };
}

export async function listSubmissions(shop, { formId, search, from, to, take = 20, skip = 0 } = {}) {
  const where = submissionsWhere(shop, { formId, search, from, to });
  const pageSize = Math.min(Math.max(Number(take) || 20, 1), 100);
  const offset = Math.max(Number(skip) || 0, 0);

  const [submissions, total] = await Promise.all([
    db.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: offset,
      include: { form: { select: { id: true, name: true, publicId: true, schema: true } } },
    }),
    db.submission.count({ where }),
  ]);

  return { submissions, total, take: pageSize, skip: offset };
}

export async function getSubmission(shop, submissionId) {
  return db.submission.findFirst({
    where: { id: submissionId, shop },
    include: { form: { select: { id: true, name: true, publicId: true, schema: true } } },
  });
}

export async function setSubmissionRead(shop, submissionId, isRead) {
  const existing = await getSubmission(shop, submissionId);
  if (!existing) return null;
  return db.submission.update({
    where: { id: submissionId },
    data: { isRead: Boolean(isRead) },
  });
}

export async function deleteSubmission(shop, submissionId) {
  const result = await db.submission.deleteMany({
    where: { id: submissionId, shop },
  });
  return result.count > 0;
}
