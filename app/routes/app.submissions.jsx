import { useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Page,
  Select,
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
  return {
    forms: Array.isArray(forms) ? forms : [],
    submissions: Array.isArray(submissions) ? submissions : [],
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
    .map((value) => (typeof value === "object" ? value.name || "[file]" : String(value)))
    .join(" · ")
    .slice(0, 180) || "—";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function Submissions() {
  const loaderData = useLoaderData() || {};
  const forms = Array.isArray(loaderData.forms) ? loaderData.forms : [];
  const submissions = Array.isArray(loaderData.submissions) ? loaderData.submissions : [];
  const filters = loaderData.filters || { formId: "", search: "" };
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [search, setSearch] = useState(filters.search || "");

  const refresh = (next = {}) => {
    const params = new URLSearchParams();
    const formId = next.formId ?? filters.formId;
    const term = next.search ?? search;
    if (formId) params.set("formId", formId);
    if (term) params.set("search", term);
    navigate(`/app/submissions?${params.toString()}`);
  };

  return (
    <Page
      title="Submissions"
      subtitle="Review form responses collected from your storefront."
      primaryAction={{ content: "Forms", onAction: () => navigate("/app/forms") }}
    >
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
              heading="No submissions yet"
              action={{ content: "Create a form", onAction: () => navigate("/app/forms/new") }}
            >
              <p>Publish a form and submissions will appear here.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <BlockStack gap="0">
              {submissions.map((submission, index) => (
                <div
                  key={submission.id}
                  style={{
                    padding: "16px 4px",
                    borderBottom: index === submissions.length - 1 ? "0" : "1px solid #e1e3e5",
                  }}
                >
                  <InlineStack gap="300" align="space-between" blockAlign="start" wrap>
                    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">
                          {submission.form?.name || "Unknown form"}
                        </Text>
                        <Text as="p" tone="subdued">
                          {previewData(submission.data)}
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Received {formatDate(submission.createdAt)}
                        </Text>
                      </BlockStack>
                    </div>
                    <InlineStack gap="300" align="end" blockAlign="center" wrap>
                      <Badge tone={submission.isRead ? undefined : "info"}>
                        {submission.isRead ? "Read" : "Unread"}
                      </Badge>
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
                    </InlineStack>
                  </InlineStack>
                </div>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
