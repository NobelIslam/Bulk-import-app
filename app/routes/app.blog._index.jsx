import { useEffect, useState } from "react";
import { Link, redirect, useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IndexTable,
  InlineGrid,
  Modal,
  Page,
  Popover,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { DeleteIcon, DuplicateIcon, EditIcon, ExternalIcon, PlusIcon } from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import { authenticate } from "../shopify.server";
import { createPost, deletePost, duplicatePost, getArticle, importArticle, listArticles, listBlogs, listPosts } from "../blog/blog.server";
import { POST_TEMPLATES } from "../blog/blocks";
import { articleToDoc } from "../blog/import";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const [posts, shopify, shopifyArticles] = await Promise.all([
    listPosts(session.shop),
    listBlogs(admin).catch((error) => ({ blogs: [], error: error.message })),
    listArticles(admin).catch((error) => ({ articles: [], error: error.message })),
  ]);
  const linked = new Set(posts.map((post) => post.articleId).filter(Boolean));
  return {
    posts,
    articles: shopifyArticles.articles.filter((article) => !linked.has(article.id)),
    articlesTruncated: Boolean(shopifyArticles.truncated),
    blogs: shopify.blogs,
    blogsError: shopify.error || shopifyArticles.error || null,
    storeUrl: shopify.shop?.primaryDomain?.url || `https://${session.shop}`,
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create") {
    const post = await createPost(session.shop, {
      template: String(formData.get("template") || "blank"),
      title: String(formData.get("title") || "").trim() || undefined,
      blogId: String(formData.get("blogId") || "") || undefined,
    });
    return redirect(`/app/blog/${post.id}`);
  }

  const id = String(formData.get("id") || "");
  // Step 1 of an import: send the article to the browser, which turns its
  // HTML into editable elements (it has a real HTML parser).
  if (intent === "getArticle") {
    try {
      const article = await getArticle(admin, id);
      return article ? { ok: true, article } : { ok: false, message: "That article no longer exists." };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
  // Step 2: save the converted document linked to the article, then open it.
  if (intent === "import") {
    let doc = null;
    try {
      doc = JSON.parse(String(formData.get("doc") || "null"));
    } catch {
      doc = null;
    }
    if (!doc) return { ok: false, message: "Could not read the converted post." };
    try {
      const post = await importArticle(admin, session.shop, id, doc);
      if (!post) return { ok: false, message: "That article no longer exists." };
      return redirect(`/app/blog/${post.id}`);
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
  if (intent === "duplicate") {
    const post = await duplicatePost(session.shop, id);
    return post ? { ok: true, message: "Post duplicated." } : { ok: false, message: "Post not found." };
  }
  if (intent === "delete") {
    try {
      return await deletePost(admin, session.shop, id, { deleteArticle: formData.get("deleteArticle") === "true" });
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }
  return { ok: false, message: "Unknown action." };
};

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export default function BlogPosts() {
  const { posts, articles, articlesTruncated, blogs, blogsError, storeUrl } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const importer = useArticleImport(shopify);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.message) return;
    shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    if (fetcher.data.ok) setDeleteTarget(null);
  }, [fetcher.state, fetcher.data, shopify]);

  const blogTitle = (id) => blogs.find((blog) => blog.id === id)?.title || "—";

  const rows = posts.map((post, index) => {
    const published = post.status === "PUBLISHED";
    const liveUrl = post.blogHandle && post.articleHandle ? `${storeUrl}/blogs/${post.blogHandle}/${post.articleHandle}` : null;
    return (
      <IndexTable.Row id={post.id} key={post.id} position={index}>
        <IndexTable.Cell>
          <Link to={`/app/blog/${post.id}`}>
            <Text as="span" fontWeight="semibold">
              {post.title}
            </Text>
          </Link>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={published ? "success" : undefined}>{published ? "Published" : post.articleId ? "Hidden" : "Draft"}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>{post.blogId ? blogTitle(post.blogId) : "—"}</IndexTable.Cell>
        <IndexTable.Cell>{formatDate(post.updatedAt)}</IndexTable.Cell>
        <IndexTable.Cell>
          <RowActions
            disabled={busy}
            liveUrl={published ? liveUrl : null}
            onEdit={() => navigate(`/app/blog/${post.id}`)}
            onDuplicate={() => fetcher.submit({ intent: "duplicate", id: post.id }, { method: "post" })}
            onDelete={() => setDeleteTarget(post)}
          />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Blog Builder"
      subtitle="Design blog posts with drag and drop, then publish them straight to your Shopify blog."
      primaryAction={{ content: "Create post", icon: PlusIcon, onAction: () => setCreating(true) }}
    >
      <BlockStack gap="400">
        {blogsError && (
          <Banner tone="warning" title="Couldn't load your blogs">
            <p>{blogsError}</p>
          </Banner>
        )}
        {!blogsError && blogs.length === 0 && (
          <Banner tone="info" title="Your store has no blog yet">
            <p>Create one in Online Store → Blog posts → Manage blogs, then come back to publish posts to it.</p>
          </Banner>
        )}

        {posts.length === 0 ? (
          <Card>
            <EmptyState
              heading="Design your first blog post"
              action={{ content: "Create post", icon: PlusIcon, onAction: () => setCreating(true) }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Drag in headings, images, columns, buttons and more. Publishing saves the design into your blog post.</p>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexTable
              selectable={false}
              itemCount={posts.length}
              headings={[{ title: "Post" }, { title: "Status" }, { title: "Blog" }, { title: "Last edited" }, { title: "Actions" }]}
            >
              {rows}
            </IndexTable>
          </Card>
        )}

        {articles.length > 0 && (
          <Card padding="0">
            <div style={{ padding: "16px 16px 8px" }}>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Your other Shopify blog posts
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Posts written in Shopify. Open one in the builder to edit it with drag and drop. Publishing updates the
                  same post and keeps its address.
                </Text>
              </BlockStack>
            </div>
            <IndexTable
              selectable={false}
              itemCount={articles.length}
              headings={[{ title: "Post" }, { title: "Status" }, { title: "Blog" }, { title: "Last edited" }, { title: "Actions" }]}
            >
              {articles.map((article, index) => (
                <IndexTable.Row id={article.id} key={article.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {article.title}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={article.isPublished ? "success" : undefined}>{article.isPublished ? "Published" : "Hidden"}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{article.blog?.title || "—"}</IndexTable.Cell>
                  <IndexTable.Cell>{formatDate(article.updatedAt)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Button
                      icon={EditIcon}
                      loading={importer.activeId === article.id}
                      disabled={Boolean(importer.activeId) && importer.activeId !== article.id}
                      onClick={() => importer.start(article.id)}
                    >
                      Edit in builder
                    </Button>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            {articlesTruncated && (
              <div style={{ padding: 12 }}>
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing your 250 most recently edited posts.
                </Text>
              </div>
            )}
          </Card>
        )}
      </BlockStack>

      <CreateModal open={creating} blogs={blogs} onClose={() => setCreating(false)} />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Delete “${deleteTarget?.title}”?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: busy,
          onAction: () =>
            fetcher.submit(
              { intent: "delete", id: deleteTarget.id, deleteArticle: String(deleteTarget.deleteArticle !== false && Boolean(deleteTarget.articleId)) },
              { method: "post" },
            ),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">This removes the post from the editor. This can&apos;t be undone.</Text>
            {deleteTarget?.articleId && (
              <Checkbox
                label="Also delete the article from my Shopify blog"
                checked={deleteTarget.deleteArticle !== false}
                onChange={(checked) => setDeleteTarget({ ...deleteTarget, deleteArticle: checked })}
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// Two steps: fetch the article, convert its HTML here in the browser, then
// create the linked editor post (the server redirects into the builder).
function useArticleImport(shopify) {
  const loadFetcher = useFetcher();
  const saveFetcher = useFetcher();
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (loadFetcher.state !== "idle" || !loadFetcher.data || !activeId) return;
    const data = loadFetcher.data;
    if (!data.ok || !data.article) {
      shopify.toast.show(data.message || "Could not open that post.", { isError: true });
      setActiveId(null);
      return;
    }
    let doc;
    try {
      doc = articleToDoc(data.article);
    } catch {
      shopify.toast.show("Could not convert that post.", { isError: true });
      setActiveId(null);
      return;
    }
    saveFetcher.submit({ intent: "import", id: data.article.id, doc: JSON.stringify(doc) }, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFetcher.state, loadFetcher.data]);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if (saveFetcher.data.ok === false) shopify.toast.show(saveFetcher.data.message, { isError: true });
    setActiveId(null);
  }, [saveFetcher.state, saveFetcher.data, shopify]);

  return {
    activeId,
    start: (id) => {
      setActiveId(id);
      loadFetcher.submit({ intent: "getArticle", id }, { method: "post" });
    },
  };
}

function RowActions({ disabled, liveUrl, onEdit, onDuplicate, onDelete }) {
  const [active, setActive] = useState(false);
  const items = [
    { content: "Edit", icon: EditIcon, onAction: onEdit },
    { content: "Duplicate", icon: DuplicateIcon, onAction: onDuplicate },
    ...(liveUrl ? [{ content: "View on store", icon: ExternalIcon, url: liveUrl, external: true }] : []),
    { content: "Delete", icon: DeleteIcon, destructive: true, onAction: onDelete },
  ];
  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      activator={
        <Button variant="plain" disclosure onClick={() => setActive((value) => !value)} disabled={disabled}>
          Actions
        </Button>
      }
    >
      <ActionList actionRole="menuitem" items={items} onActionAnyItem={() => setActive(false)} />
    </Popover>
  );
}

function CreateModal({ open, blogs, onClose }) {
  const fetcher = useFetcher();
  const [template, setTemplate] = useState("article");
  const [title, setTitle] = useState("");
  const [blogId, setBlogId] = useState("");
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (open) setBlogId((current) => current || blogs[0]?.id || "");
  }, [open, blogs]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a blog post"
      size="large"
      primaryAction={{
        content: "Create and start designing",
        loading: busy,
        onAction: () => fetcher.submit({ intent: "create", template, title, blogId }, { method: "post" }),
      }}
      secondaryActions={[{ content: "Cancel", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
            <TextField label="Post title" value={title} onChange={setTitle} autoComplete="off" placeholder="Untitled post" />
            <Select
              label="Publish to blog"
              options={blogs.length ? blogs.map((blog) => ({ label: blog.title, value: blog.id })) : [{ label: "No blogs found", value: "" }]}
              value={blogId}
              onChange={setBlogId}
              disabled={!blogs.length}
            />
          </InlineGrid>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Start from
            </Text>
            <div className="bb-templates" role="radiogroup" aria-label="Start from">
              {POST_TEMPLATES.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="radio"
                  aria-checked={template === entry.key}
                  className="bb-template"
                  onClick={() => setTemplate(entry.key)}
                >
                  <TemplateSketch kind={entry.key} />
                  <strong>{entry.label}</strong>
                  <span>{entry.description}</span>
                </button>
              ))}
            </div>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
      <style>{TEMPLATE_CSS}</style>
    </Modal>
  );
}

// Simple schematic previews of each starter layout.
function TemplateSketch({ kind }) {
  const bar = (width, height = 6, extra = {}) => <span style={{ display: "block", width, height, borderRadius: 3, background: "#c9cccf", ...extra }} />;
  const img = (height = 30) => <span style={{ display: "block", height, borderRadius: 4, background: "#dfe3e8" }} />;
  let content;
  if (kind === "blank") content = <span style={{ margin: "auto", color: "#8a8a8a", fontSize: 22 }}>+</span>;
  else if (kind === "article") content = [bar("90%"), img(), bar("60%", 8), bar("95%"), bar("80%")];
  else if (kind === "feature")
    content = [
      <span key="h" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 6, background: "#f4f1ea", borderRadius: 4 }}>
        {bar("70%", 8)}
        {bar("40%", 6, { background: "#303030" })}
      </span>,
      <span key="r" style={{ display: "flex", gap: 6 }}>
        <span style={{ flex: 1 }}>{img(22)}</span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {bar("80%")}
          {bar("100%")}
        </span>
      </span>,
    ];
  else content = [1, 2].map((n) => <span key={n} style={{ display: "flex", flexDirection: "column", gap: 4 }}>{bar("50%", 8)}{img(18)}</span>);
  return (
    <span className="bb-template__sketch" aria-hidden="true">
      {Array.isArray(content) ? content.map((node, index) => <span key={index}>{node}</span>) : content}
    </span>
  );
}

const TEMPLATE_CSS = `
.bb-templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.bb-template { display: flex; flex-direction: column; gap: 6px; padding: 12px; text-align: left; font: inherit; color: #303030; background: #fff; border: 1px solid #e1e3e5; border-radius: 12px; cursor: pointer; }
.bb-template:hover { border-color: #8a8a8a; }
.bb-template[aria-checked="true"] { border-color: #008060; box-shadow: 0 0 0 1px #008060; }
.bb-template span:not(.bb-template__sketch):not(.bb-template__sketch *) { font-size: 13px; color: #616161; }
.bb-template__sketch { display: flex; flex-direction: column; gap: 5px; height: 110px; padding: 10px; background: #f6f6f7; border-radius: 8px; overflow: hidden; }
`;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
