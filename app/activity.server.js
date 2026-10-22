import db from "./db.server";

// Events of the same kind and label within this window merge into one row,
// so a 20-batch bulk save reads as one "Updated 300 products".
const MERGE_WINDOW_MS = 30 * 60 * 1000;

// Records an event for the Home page. Never throws: activity is a nicety and
// must not break the action that triggered it.
export async function logActivity(shop, kind, { label = "", count = 1 } = {}) {
  if (!shop || !kind || count <= 0) return;
  try {
    const cleanLabel = String(label).slice(0, 200);
    const recent = await db.activityLog.findFirst({
      where: { shop, kind, label: cleanLabel, updatedAt: { gte: new Date(Date.now() - MERGE_WINDOW_MS) } },
      orderBy: { updatedAt: "desc" },
    });
    if (recent) {
      await db.activityLog.update({ where: { id: recent.id }, data: { count: recent.count + count } });
    } else {
      await db.activityLog.create({ data: { shop, kind, label: cleanLabel, count } });
    }
  } catch (error) {
    console.error("logActivity failed:", error.message);
  }
}

export async function listActivity(shop, take = 6) {
  return db.activityLog.findMany({ where: { shop }, orderBy: { updatedAt: "desc" }, take });
}
