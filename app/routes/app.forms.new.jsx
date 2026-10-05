import { Form, redirect, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Banner, BlockStack, Page } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import { createForm } from "../forms/forms.server";
import { getTemplate, getTemplateCategories } from "../forms/templates";
import TemplatePicker from "../components/forms/TemplatePicker";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const templateKey = String(formData.get("templateKey") || "blank");

  const form = await createForm(session.shop, { template: getTemplate(templateKey) });
  if (form?.error) {
    return { error: form.error };
  }

  // This is a real <Form> post, so the redirect takes the merchant to the builder.
  return redirect(`/app/forms/${form.id}`);
};

export default function NewForm() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <Page
      title="Create a form"
      backAction={{ content: "Forms", url: "/app/forms" }}
      subtitle="Start from a template or build from scratch — everything stays editable afterwards."
    >
      {navigation.state !== "idle" && (
        <Banner tone="info" title="Creating your form…">
          <p>Hang tight, this takes a second.</p>
        </Banner>
      )}

      <Form method="post">
        <BlockStack gap="400">
          <TemplatePicker categories={getTemplateCategories()} busy={busy} />
        </BlockStack>
      </Form>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};