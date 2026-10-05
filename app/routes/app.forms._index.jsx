import { useEffect, useState } from "react";
import { Link, useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  EmptyState,
  IndexTable,
  Modal,
  Page,
  Popover,
  Text,
  TextField,
} from "@shopify/polaris";
import { DeleteIcon, DuplicateIcon, EditIcon, PlusIcon } from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import {
  deleteForm,
  duplicateForm,
  listForms,
  renameForm,
  setFormStatus,
} from "../forms/forms.server";
import { getPlanForShop } from "../config/limits.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const forms = await listForms(session.shop);
  return { forms, plan: getPlanForShop(session.shop) };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const formId = formData.get("formId");

  if (!formId) {
    return { ok: false, message: "Missing form." };
  }

  if (intent === "rename") {
    const form = await renameForm(session.shop, String(formId), String(formData.get("name") || ""));
    if (!form) return { ok: false, message: "Form not found." };
    return { ok: true, message: "Form renamed." };
  }

  if (intent === "duplicate") {
    const form = await duplicateForm(session.shop, String(formId));
    if (form?.error) return { ok: false, message: form.error };
    return { ok: true, message: "Form duplicated. The copy is a draft." };
  }

  if (intent === "delete") {
    const deleted = await deleteForm(session.shop, String(formId));
    return deleted
      ? { ok: true, message: "Form and its submissions deleted." }
      : { ok: false, message: "Form not found." };
  }

  if (intent === "publish" || intent === "unpublish") {
    const form = await setFormStatus(session.shop, String(formId), intent === "publish" ? "PUBLISHED" : "DRAFT");
    return {
      ok: Boolean(form),
      message: intent === "publish" ? "Form published." : "Form unpublished.",
    };
  }

  return { ok: false, message: "Unknown action." };
};

const PLACEMENT_LABELS = {
  inline: "Inline on page",
  popup: "Popup",
  button: "Button",
};

export default function FormsIndex() {
  const data = useLoaderData() || {};\n  const forms = Array.isArray(data.forms) ? data.forms : [];\n  const plan = data.plan || { label: "Free", forms: 0, submissionsPerMonth: 0 };
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);

  const busy = fetcher.state !== "idle";
  const lastAction = fetcher.data;

  useEffect(() => {
    if (!lastAction || busy) return;
    shopify.toast.show(lastAction.message, { isError: !lastAction.ok });
    if (lastAction.ok) {
      setDeleteTarget(null);
      setRenameTarget(null);
    }
  }, [lastAction, busy, shopify]);

  const submit = (payload) => fetcher.submit(payload, { method: "post" });

  const rows = forms.map((form) => {
    const published = form.status === "PUBLISHED";
    const placement = form.placement?.mode || "inline";

    return (
      <IndexTable.Row key={form.id}>
        <IndexTable.Cell>
          <Link to={`/app/forms/${form.id}`}>{form.name}</Link>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" tone="subdued">
              ID: {form.publicId}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={published ? "success" : undefined}>{published ? "Published" : "Draft"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{PLACEMENT_LABELS[placement] || placement}</IndexTable.Cell>
        <IndexTable.Cell>{form._count.submissions.toLocaleString()}</IndexTable.Cell>
        <IndexTable.Cell>{formatDate(form.updatedAt)}</IndexTable.Cell>
        <IndexTable.Cell>
          <RowActions
            published={published}
            disabled={busy}
            onEdit={() => navigate(`/app/forms/${form.id}`)}
            onRename={() => setRenameTarget(form)}
            onDuplicate={() => submit({ intent: "duplicate", formId: form.id })}
            onTogglePublish={() => submit({ intent: published ? "unpublish" : "publish", formId: form.id })}
            onDelete={() => setDeleteTarget(form)}
          />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Forms"
      subtitle={`Build forms, publish them to your theme and collect submissions.`}
      primaryAction={{ content: "Create form", icon: PlusIcon, onAction: () => navigate("/app/forms/new") }}
    >
      {lastAction && !lastAction.ok && (
        <Banner tone="critical" title="That didn't work">
          <p>{lastAction.message}</p>
        </Banner>
      )}

      {forms.length === 0 ? (
        <EmptyState
          heading="Create your first form"
          content="Pick a template — contact, newsletter signup, quote request and more — or start from scratch. You can publish it to your theme without touching code."
          primaryAction={{ content: "Create form", icon: PlusIcon, onAction: () => navigate("/app/forms/new") }}
          secondaryAction={{ content: "Learn about templates", onAction: () => navigate("/app/forms/new") }}
        >
          <Box paddingBlockStart="400">
            <Text as="p" variant="bodySm" tone="subdued">
              {plan.label} plan — up to {plan.forms} forms and {plan.submissionsPerMonth.toLocaleString()} submissions
              per month.
            </Text>
          </Box>
        </EmptyState>
      ) : (
        <IndexTable
          selectable={false}
          itemCount={forms.length}
          headings={[
            { title: "Form" },
            { title: "Status" },
            { title: "Placement" },
            { title: "Submissions" },
            { title: "Last updated" },
            { title: "Actions" },
          ]}
        >
          {rows}
        </IndexTable>
      )}

      <DeleteModal
        form={deleteTarget}
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => submit({ intent: "delete", formId: deleteTarget.id })}
      />

      <RenameModal
        form={renameTarget}
        busy={busy}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => submit({ intent: "rename", formId: renameTarget.id, name })}
      />
    </Page>
  );
}

function RowActions({ published, disabled, onEdit, onRename, onDuplicate, onTogglePublish, onDelete }) {
  const [active, setActive] = useState(false);
  const actions = [
    { content: "Edit", icon: EditIcon, onAction: onEdit },
    { content: "Rename", onAction: onRename },
    { content: "Duplicate", icon: DuplicateIcon, onAction: onDuplicate },
    {
      content: published ? "Unpublish" : "Publish",
      onAction: onTogglePublish,
    },
  ];

  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      activator={
        <Button variant="plain" onClick={() => setActive(true)} disabled={disabled}>
          Actions
        </Button>
      }
    >
      <ActionList
        items={actions}
        onAction={(item) => {
          setActive(false);
          item.onAction();
        }}
      />
      <ActionList
        items={[{ content: "Delete", icon: DeleteIcon, tone: "critical", onAction: onDelete }]}
        onAction={(item) => {
          setActive(false);
          item.onAction();
        }}
      />
    </Popover>
  );
}

function DeleteModal({ form, busy, onCancel, onConfirm }) {
  return (
    <Modal
      open={Boolean(form)}
      onDismiss={onCancel}
      title={`Delete ${form?.name}?`}
      primaryAction={{ content: "Delete form", tone: "critical", loading: busy, onAction: onConfirm }}
      secondaryActions={[{ content: "Cancel", onAction: onCancel }]}
    >
      <Modal.Section>
        <Text as="p" variant="bodyMd">
          This removes the form and every submission it has collected. This cannot be undone.
        </Text>
      </Modal.Section>
    </Modal>
  );
}

function RenameModal({ form, busy, onCancel, onConfirm }) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (form) {
      setName(form.name);
      setTouched(false);
    }
  }, [form]);

  return (
    <Modal
      open={Boolean(form)}
      onDismiss={onCancel}
      title="Rename form"
      primaryAction={{
        content: "Save",
        loading: busy,
        disabled: touched && !name.trim(),
        onAction: () => onConfirm(name.trim()),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onCancel }]}
    >
      <Modal.Section>
        <TextField
          label="Form name"
          value={name}
          autoComplete="off"
          showCharacterCount
          maxLength={120}
          onChange={(value) => {
            setName(value);
            setTouched(true);
          }}
        />
      </Modal.Section>
    </Modal>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};