import { useCallback, useReducer } from "react";
import { createFieldId, defaultField, findField, slugifyKey } from "./fields";

const HISTORY_LIMIT = 60;

// ─── Pure document operations ────────────────────────────────────────────────
// A "document" is everything the merchant can edit: { name, schema, desktopStyle, mobileStyle }.

export function updateField(doc, fieldId, patch) {
  return {
    ...doc,
    schema: {
      ...doc.schema,
      fields: doc.schema.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    },
  };
}

export function updateFieldSettings(doc, fieldId, section, patch) {
  const field = findField(doc.schema, fieldId);
  if (!field) return doc;
  return updateField(doc, fieldId, { [section]: { ...field[section], ...patch } });
}

export function addField(doc, type, index = null) {
  const takenKeys = doc.schema.fields.map((field) => field.key).filter(Boolean);
  const field = defaultField(type, takenKeys);
  if (!field) return doc;

  const fields = [...doc.schema.fields];
  const at = index === null || index < 0 || index > fields.length ? fields.length : index;
  fields.splice(at, 0, field);
  return { ...doc, schema: { ...doc.schema, fields } };
}

export function removeField(doc, fieldId) {
  const field = findField(doc.schema, fieldId);
  if (!field || field.type === "submitButton") return doc;
  return {
    ...doc,
    schema: {
      ...doc.schema,
      fields: doc.schema.fields.filter((entry) => entry.id !== fieldId),
    },
  };
}

export function duplicateField(doc, fieldId) {
  const field = findField(doc.schema, fieldId);
  if (!field) return doc;

  const takenKeys = doc.schema.fields.map((entry) => entry.key).filter(Boolean);
  const index = doc.schema.fields.findIndex((entry) => entry.id === fieldId);
  const copy = {
    ...field,
    id: createFieldId(),
    key: field.key ? slugifyKey(field.key, takenKeys) : null,
  };

  const fields = [...doc.schema.fields];
  fields.splice(index + 1, 0, copy);
  return { ...doc, schema: { ...doc.schema, fields } };
}

export function moveField(doc, activeId, overId) {
  if (!activeId || !overId || activeId === overId) return doc;
  const fields = [...doc.schema.fields];
  const from = fields.findIndex((field) => field.id === activeId);
  const to = fields.findIndex((field) => field.id === overId);
  if (from === -1 || to === -1) return doc;
  fields.splice(to, 0, fields.splice(from, 1)[0]);
  return { ...doc, schema: { ...doc.schema, fields } };
}

export function setSchemaSettings(doc, patch) {
  return { ...doc, schema: { ...doc.schema, settings: { ...doc.schema.settings, ...patch } } };
}

export function setStyle(doc, viewport, patch) {
  const key = viewport === "mobile" ? "mobileStyle" : "desktopStyle";
  return { ...doc, [key]: { ...doc[key], ...patch } };
}

export function clearStyleOverride(doc, key) {
  const next = { ...doc.mobileStyle };
  delete next[key];
  return { ...doc, mobileStyle: next };
}

// ─── Undo/redo history ───────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case "load":
      return { present: action.doc, past: [], future: [], selectedFieldId: null, baseline: action.doc };

    case "update": {
      const next = action.updater(state.present);
      if (next === state.present) return state;
      // Typing in the same control replaces the last entry instead of stacking
      // one undo step per keystroke.
      const canCoalesce =
        action.coalesceKey && state.past.length > 0 && state.lastCoalesceKey === action.coalesceKey;
      if (canCoalesce) return { ...state, present: next, future: [] };
      return {
        ...state,
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: [],
        lastCoalesceKey: action.coalesceKey || null,
      };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        lastCoalesceKey: null,
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        lastCoalesceKey: null,
      };
    }

    case "select":
      return state.selectedFieldId === action.fieldId ? state : { ...state, selectedFieldId: action.fieldId };

    default:
      return state;
  }
}

export function isDirty(state) {
  return JSON.stringify(state.present) !== JSON.stringify(state.baseline);
}

export default function useBuilderHistory(initialDoc) {
  const [state, dispatch] = useReducer(reducer, {
    present: initialDoc,
    past: [],
    future: [],
    selectedFieldId: null,
    baseline: initialDoc,
    lastCoalesceKey: null,
  });

  const update = useCallback((updater, coalesceKey = null) => {
    dispatch({ type: "update", updater, coalesceKey });
  }, []);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const select = useCallback((fieldId) => dispatch({ type: "select", fieldId }), []);
  const load = useCallback((doc) => dispatch({ type: "load", doc }), []);

  return {
    doc: state.present,
    selectedFieldId: state.selectedFieldId,
    update,
    undo,
    redo,
    select,
    load,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: isDirty(state),
  };
}