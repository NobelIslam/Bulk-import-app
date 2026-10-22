import { useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { BlockStack, Box, Button, Card, Icon, InlineGrid, InlineStack, Page, Text } from "@shopify/polaris";
import { BlogIcon, DatabaseIcon, FormsIcon, EnvelopeIcon, PageAddIcon } from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const count = (query) => query.catch(() => null);
  const [posts, published, forms, liveForms, unread] = await Promise.all([
    count(db.blogPost.count({ where: { shop } })),
    count(db.blogPost.count({ where: { shop, status: "PUBLISHED" } })),
    count(db.form.count({ where: { shop } })),
    count(db.form.count({ where: { shop, status: "PUBLISHED" } })),
    count(db.submission.count({ where: { shop, isRead: false } })),
  ]);
  return { posts, published, forms, liveForms, unread };
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Tools grouped by what they do, in the same order as the sidebar.
const GROUPS = [
  {
    title: "Content",
    description: "Build blog posts, import pages in bulk and edit your store's custom content.",
    tools: [
      {
        name: "Blog Builder",
        url: "/app/blog",
        icon: BlogIcon,
        description: "Design blog posts with drag and drop and publish them straight to your Shopify blog.",
        action: "Open Blog Builder",
        stat: ({ posts, published }) =>
          posts === null ? null : `${posts} post${posts === 1 ? "" : "s"} · ${published} published`,
      },
      {
        name: "Page Importer",
        url: "/app/page-importer",
        icon: PageAddIcon,
        description: "Create many store pages at once by uploading a CSV file.",
        action: "Import pages",
      },
      {
        name: "Metaobject Editor",
        url: "/app/metaobjects",
        icon: DatabaseIcon,
        description: "Edit metaobject entries in bulk in a spreadsheet-style grid, with CSV export and import.",
        action: "Edit metaobjects",
      },
    ],
  },
  {
    title: "Forms",
    description: "Build forms for your storefront and manage the responses they collect.",
    tools: [
      {
        name: "Form Builder",
        url: "/app/forms",
        icon: FormsIcon,
        description: "Build contact, newsletter, quote and other forms with drag and drop, then add them to your theme.",
        action: "Open Form Builder",
        stat: ({ forms, liveForms }) => (forms === null ? null : `${plural(forms, "form")} · ${liveForms} published`),
      },
      {
        name: "Form Submissions",
        url: "/app/submissions",
        icon: EnvelopeIcon,
        description: "Read, search and manage every response your forms collect.",
        action: "View submissions",
        stat: ({ unread }) => (unread === null ? null : unread ? `${plural(unread, "unread response")}` : "All caught up"),
      },
    ],
  },
];

export default function Home() {
  const stats = useLoaderData();
  const navigate = useNavigate();

  return (
    <Page title="Home" subtitle="Everything you can do with the app, grouped by what it's for.">
      <BlockStack gap="600">
        {GROUPS.map((group) => (
          <BlockStack key={group.title} gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg">
                {group.title}
              </Text>
              <Text as="p" tone="subdued">
                {group.description}
              </Text>
            </BlockStack>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              {group.tools.map((tool) => {
                const stat = tool.stat?.(stats);
                return (
                  <Card key={tool.name}>
                    <BlockStack gap="300">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <Box background="bg-surface-secondary" padding="200" borderRadius="200">
                          <Icon source={tool.icon} />
                        </Box>
                        <Text as="h3" variant="headingMd">
                          {tool.name}
                        </Text>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        {tool.description}
                      </Text>
                      {stat && (
                        <Text as="p" variant="bodySm" fontWeight="medium">
                          {stat}
                        </Text>
                      )}
                      <InlineStack>
                        <Button onClick={() => navigate(tool.url)}>{tool.action}</Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </InlineGrid>
          </BlockStack>
        ))}
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
