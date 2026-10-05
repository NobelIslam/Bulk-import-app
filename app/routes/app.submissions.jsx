import { useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  EmptyState,
  IndexTable,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  deleteSubmission,
  listForms,
  listSubmissions,
  setSubmissionRead,
} from "../forms/forms.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const formId = url.searchParams.get("formId") || "";
  const search = url.searchParams.get("search") || "";
  const [forms, submissions] = await Promise.all([
    listForms(session.shop),
    listSubmissions(session.shop, { formId, search }),
  ]);
  return { forms, submissions, filters: { formId, search } };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const data = await request.formData();
  const intent = String(data.get("intent") || "");
  const id = String(data.get("id") || "");

  if (intent === "read") {
    const result = await setSubmissionRead(session.shop, id, data.get("value") === "true");
    return result ? { ok: true } : { ok: false, message: "Submission not found." };
  }

  if (intent === "delete") {
    return { ok: await deleteSubmission(session.shop, id) };
  }

  return { ok: false, message: "Unknown action." };
}

function previewData(data) {
  if (!data || typeof data !== "object") return "—";
  return Object.values(data)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => typeof value === "object" ? value.name || "[file]" : String(value))
    .join(" · ")
    .slice(0, 180) || "—";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Submissions() {
  const { forms, submissions, filters } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [search, setSearch] = useState(filters.search);

  const refresh = (next = {}) => {
    const params = new URLSearchParams();
    const formId = next.formId ?? filters.formId;
    const term = next.search ?? search;
    if (formId) params.set("formId", formId);
    if (term) params.set("search", term);
    navigate(`/app/submissions?${params.toString()}`);
  };

  const rows = submissions.map((submission) => (
    <IndexTable.Row id={submission.id} key={submission.id}>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Text as="span" fontWeight="semibold">
            {submission.form.name}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {previewData(submission.data)}
          </Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={submission.isRead ? undefined : "info"}>
          {submission.isRead ? "Read" : "Unread"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{formatDate(submission.createdAt)}</IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Button
            variant="plain"
            onClick={() =>
              fetcher.submit(
                { intent: "read", id: submission.id, value: String(!submission.isRead) },
                { method: "post" },
              )
            }
          >
            Mark {submission.isRead ? "unread" : "read"}
          </Button>
          <Button
            variant="plain"
            tone="critical"
            onClick={() => {
              if (window.confirm("Delete this submission?")) {
                fetcher.submit({ intent: "delete", id: submission.id }, { method: "post" });
              }
            }}
          >
            Delete
          </Button>
        </BlockStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Submissions"
      subtitle="Review form responses collected from your storefront."
      primaryAction={{ content: "Forms", onAction: () => navigate("/app/forms") }}
    >
      <BlockStack gap="400">
        <BlockStack gap="300">
          <TextField
            label="Search"
            value={search}
            onChange={setSearch}
            onBlur={() => refresh()}
            autoComplete="off"
            placeholder="Search submissions"
          />
          <select
            aria-label="Filter by form"
            value={filters.formId}
            onChange={(event) => refresh({ formId: event.currentTarget.value })}
            style={{ maxWidth: 360, padding: 8 }}
          >
            <option value="">All forms</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>{form.name}</option>
            ))}
          </select>
        </BlockStack>

        {submissions.length === 0 ? (
          <EmptyState
            heading="No submissions yet"
            image=""
            action={{ content: "Create a form", onAction: () => navigate("/app/forms/new") }}
          >
            <p>Publish a form and submissions will appear here.</p>
          </EmptyState>
        ) : (
          <IndexTable
            selectable={false}
            itemCount={submissions.length}
            headings={[
              { title: "Submission" },
              { title: "Status" },
              { title: "Received" },
              { title: "Actions" },
            ]}
          >
            {rows}
          </IndexTable>
        )}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
