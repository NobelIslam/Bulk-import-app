import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import {
  deleteSubmission,
  listForms,
  listSubmissions,
  setSubmissionRead,
} from "../forms/forms.server";
import { inputFields } from "../forms/fields";

const PAGE_SIZE = 20;

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const formId = url.searchParams.get("formId") || "";
  const search = url.searchParams.get("search") || "";
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);

  const [forms, result] = await Promise.all([
    listForms(session.shop),
    listSubmissions(session.shop, { formId, search, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
  ]);

  return {
    forms: Array.isArray(forms) ? forms : [],
    submissions: result.submissions,
    total: result.total,
    page,
    pageSize: PAGE_SIZE,
    filters: { formId, search },
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const data = await request.formData();
  const intent = String(data.get("intent") || "");
  const id = String(data.get("id") || "");

  if (intent === "read") {
    const result = await setSubmissionRead(session.shop, id, data.get("value") === "true");
    return result ? { ok: true, intent } : { ok: false, intent, message: "Submission not found." };
  }

  if (intent === "delete") {
    const ok = await deleteSubmission(session.shop, id);
    return { ok, intent, message: ok ? "Submission deleted." : "Submission not found." };
  }

  return { ok: false, message: "Unknown action." };
}

function previewData(data) {
  if (!data || typeof data !== "object") return "—";
  return (
    Object.values(data)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => (typeof value === "object" ? value.name || "[file]" : String(value)))
      .join(" · ")
      .slice(0, 160) || "—"
  );
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatAnswer(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return value.name ? `📎 ${value.name}` : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function Submissions() {
  const loaderData = useLoaderData() || {};
  const forms = Array.isArray(loaderData.forms) ? loaderData.forms : [];
  const submissions = Array.isArray(loaderData.submissions) ? loaderData.submissions : [];
  const total = loaderData.total || 0;
  const page = loaderData.page || 1;
  const pageSize = loaderData.pageSize || PAGE_SIZE;
  const filters = loaderData.filters || { formId: "", search: "" };
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [search, setSearch] = useState(filters.search || "");
  const [viewing, setViewing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.intent === "delete") {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
      if (fetcher.data.ok) setDeleteTarget(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const refresh = (next = {}) => {
    const params = new URLSearchParams();
    const formId = next.formId ?? filters.formId;
    const term = next.search ?? search;
    if (formId) params.set("formId", formId);
    if (term) params.set("search", term);
    navigate(`/app/submissions?${params.toString()}`);
  };

  const goToPage = (nextPage) => {
    const params = new URLSearchParams();
    if (filters.formId) params.set("formId", filters.formId);
    if (filters.search) params.set("search", filters.search);
    params.set("page", String(nextPage));
    navigate(`/app/submissions?${params.toString()}`);
  };

  const markRead = (submission, value) =>
    fetcher.submit({ intent: "read", id: submission.id, value: String(value) }, { method: "post" });

  const openSubmission = (submission) => {
    setViewing(submission);
    if (!submission.isRead) markRead(submission, true);
  };

  const rows = submissions.map((submission, index) => {
    const schemaFields = inputFields(submission.form?.schema);
    return (
      <IndexTable.Row
        id={submission.id}
        key={submission.id}
        position={index}
        onClick={() => openSubmission(submission)}
      >
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" fontWeight={submission.isRead ? "regular" : "bold"}>
              {submission.form?.name || "Unknown form"}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {previewData(submission.data)}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {schemaFields.length} field{schemaFields.length === 1 ? "" : "s"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={submission.isRead ? undefined : "info"}>{submission.isRead ? "Read" : "Unread"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {formatDate(submission.createdAt)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200" wrap={false}>
            <Button
              variant="plain"
              onClick={(event) => {
                event.stopPropagation();
                markRead(submission, !submission.isRead);
              }}
            >
              Mark {submission.isRead ? "unread" : "read"}
            </Button>
            <Button
              variant="plain"
              tone="critical"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteTarget(submission);
              }}
            >
              Delete
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <Page title="Submissions" subtitle="Review form responses collected from your storefront.">
      <BlockStack gap="400">
        <Card>
          <InlineStack gap="300" wrap align="end">
            <div style={{ flex: "1 1 320px" }}>
              <TextField
                label="Search submissions"
                value={search}
                onChange={setSearch}
                onBlur={() => refresh()}
                autoComplete="off"
                placeholder="Search by response"
                clearButton
                onClearButtonClick={() => {
                  setSearch("");
                  refresh({ search: "" });
                }}
              />
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <Select
                label="Filter by form"
                options={[
                  { label: "All forms", value: "" },
                  ...forms.map((form) => ({ label: form.name, value: form.id })),
                ]}
                value={filters.formId}
                onChange={(value) => refresh({ formId: value })}
              />
            </div>
          </InlineStack>
        </Card>

        {submissions.length === 0 ? (
          <Card>
            <EmptyState
              heading={total === 0 && !filters.search && !filters.formId ? "No submissions yet" : "No matching submissions"}
              action={{ content: "Create a form", onAction: () => navigate("/app/forms/new") }}
              image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
            >
              <p>
                {total === 0 && !filters.search && !filters.formId
                  ? "Publish a form and submissions will appear here."
                  : "Try a different search term or form filter."}
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              selectable={false}
              itemCount={submissions.length}
              headings={[
                { title: "Submission" },
                { title: "Fields" },
                { title: "Status" },
                { title: "Received" },
                { title: "Actions" },
              ]}
            >
              {rows}
            </IndexTable>
            <Box padding="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  {total === 0 ? "0 results" : `${rangeStart}–${rangeEnd} of ${total.toLocaleString()}`}
                </Text>
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => goToPage(page - 1)}
                  hasNext={rangeEnd < total}
                  onNext={() => goToPage(page + 1)}
                />
              </InlineStack>
            </Box>
          </Card>
        )}
      </BlockStack>

      <SubmissionDetailModal submission={viewing} onClose={() => setViewing(null)} />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this submission?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: busy,
          onAction: () => fetcher.submit({ intent: "delete", id: deleteTarget.id }, { method: "post" }),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p" variant="bodyMd">
            This permanently removes the response from {deleteTarget?.form?.name || "this form"}. This cannot be
            undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function SubmissionDetailModal({ submission, onClose }) {
  const fields = inputFields(submission?.form?.schema);
  const data = submission?.data || {};

  return (
    <Modal open={Boolean(submission)} onClose={onClose} title={submission?.form?.name || "Submission"}>
      {submission && (
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodySm" tone="subdued">
              Received {formatDate(submission.createdAt)}
            </Text>
            <BlockStack gap="300">
              {fields.map((field) => (
                <div key={field.id}>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {field.label}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {formatAnswer(data[field.key])}
                  </Text>
                </div>
              ))}
              {fields.length === 0 && (
                <Text as="p" tone="subdued">
                  This form has no capturable fields.
                </Text>
              )}
            </BlockStack>
            {submission.meta?.pageUrl && (
              <Text as="p" variant="bodySm" tone="subdued">
                Submitted from {submission.meta.pageUrl}
              </Text>
            )}
          </BlockStack>
        </Modal.Section>
      )}
    </Modal>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
