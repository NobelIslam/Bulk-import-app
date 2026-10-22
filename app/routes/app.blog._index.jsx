import { useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect, useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  Checkbox,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  Page,
  Popover,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  AppsIcon,
  ArrowUpIcon,
  BlogIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  DuplicateIcon,
  EditIcon,
  ExternalIcon,
  ImageIcon,
  ImportIcon,
  LightbulbIcon,
  ListBulletedIcon,
  MagicIcon,
  MenuHorizontalIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  ThemeTemplateIcon,
} from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import "../components/blog/blog-list.css";
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
    let ids = [];
    try {
      ids = JSON.parse(String(formData.get("ids") || "[]"));
    } catch {
      ids = [];
    }
    if (!Array.isArray(ids) || !ids.length) ids = id ? [id] : [];
    ids = ids.map(String).slice(0, 250);
    const deleteArticle = formData.get("deleteArticle") === "true";
    if (ids.length === 1) {
      try {
        return await deletePost(admin, session.shop, ids[0], { deleteArticle });
      } catch (error) {
        return { ok: false, message: error.message };
      }
    }
    let deleted = 0;
    const failures = [];
    for (const postId of ids) {
      try {
        const result = await deletePost(admin, session.shop, postId, { deleteArticle });
        if (result?.ok === false) failures.push(result.message);
        else deleted += 1;
      } catch (error) {
        failures.push(error.message);
      }
    }
    if (!failures.length) return { ok: true, message: `${deleted} posts deleted.` };
    return { ok: false, message: `${deleted} deleted, ${failures.length} failed: ${failures[0]}` };
  }
  return { ok: false, message: "Unknown action." };
};

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "hidden", label: "Hidden" },
];

const SORT_OPTIONS = [
  { value: "edited", label: "Last edited" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title A–Z" },
];

// Short in-app guides behind "Helpful resources".
const RESOURCES = [
  {
    key: "guide",
    icon: BookOpenIcon,
    tone: "blue",
    title: "Blog Builder guide",
    hint: "Learn how to create and manage blog posts.",
    steps: [
      ["Create a post", "Click Create post, give it a title, choose the blog it belongs to and pick a starting layout."],
      ["Design it", "Drag headings, text, images, columns, buttons and more onto the canvas. Select any element to change its content and style."],
      ["Publish", "Click Publish. The post is saved to your Shopify blog. Publishing again updates the same post and keeps its address."],
      ["Edit existing posts", "Use Import posts to bring a post you wrote in Shopify into the builder and keep editing it with drag and drop."],
    ],
  },
  {
    key: "templates",
    icon: ThemeTemplateIcon,
    tone: "purple",
    title: "Using templates",
    hint: "Speed up your workflow with pre-built templates.",
    steps: [
      ["Pick a starting point", "Classic article, Feature story and List post each give you a ready-made structure. Blank starts from nothing."],
      ["Replace the placeholders", "Swap in your own text and images. Every element can be moved, duplicated or deleted."],
      ["Add layouts", "In the editor, the Layouts tab adds pre-built rows such as a hero banner, image + text or a call to action."],
    ],
  },
  {
    key: "tips",
    icon: LightbulbIcon,
    tone: "green",
    title: "Best practices",
    hint: "Tips for creating engaging blog content.",
    steps: [
      ["Lead with a strong image", "Set a featured image in Post settings. It appears on your blog page and when the post is shared."],
      ["Write a summary", "A one or two sentence summary shows on the blog listing and helps readers decide to click."],
      ["Keep paragraphs short", "Break long text with headings, images and lists so the post is easy to scan on a phone."],
      ["Fill in SEO", "Add a search title and description in Post settings so the post looks good in search results."],
    ],
  },
];

const statusOf = (post) => (post.status === "PUBLISHED" ? "published" : post.articleId ? "hidden" : "draft");
const STATUS_BADGE = {
  published: { tone: "success", label: "Published" },
  hidden: { tone: "attention", label: "Hidden" },
  draft: { tone: undefined, label: "Draft" },
};

function formatDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}
function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}
function thisMonth(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}
function initials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase();
}

function readView() {
  try {
    return window.localStorage.getItem("blog-list-view") === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export default function BlogPosts() {
  const { posts, articles, articlesTruncated, blogs, blogsError, storeUrl } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const importer = useArticleImport(shopify);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resource, setResource] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [blogFilter, setBlogFilter] = useState("all");
  const [sort, setSort] = useState("edited");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const tableRef = useRef(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => setView(readView()), []);
  const changeView = (next) => {
    setView(next);
    try {
      window.localStorage.setItem("blog-list-view", next);
    } catch {
      // Remembering the view is only a convenience.
    }
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.message) return;
    shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    if (fetcher.data.ok) {
      setDeleteTarget(null);
      setSelected([]);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const blogTitle = (id) => blogs.find((blog) => blog.id === id)?.title || "—";
  const liveUrlOf = (post) =>
    post.status === "PUBLISHED" && post.blogHandle && post.articleHandle ? `${storeUrl}/blogs/${post.blogHandle}/${post.articleHandle}` : null;

  const stats = useMemo(() => {
    const published = posts.filter((post) => post.status === "PUBLISHED");
    return {
      total: posts.length,
      totalNew: posts.filter((post) => thisMonth(post.createdAt)).length,
      published: published.length,
      publishedNew: published.filter((post) => thisMonth(post.publishedAt)).length,
      drafts: posts.filter((post) => statusOf(post) === "draft").length,
    };
  }, [posts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = posts.filter(
      (post) =>
        (status === "all" || statusOf(post) === status) &&
        (blogFilter === "all" || (blogFilter === "none" ? !post.blogId : post.blogId === blogFilter)) &&
        (!needle || `${post.title} ${post.excerpt} ${post.author}`.toLowerCase().includes(needle)),
    );
    const time = (value) => new Date(value).getTime() || 0;
    const sorters = {
      edited: (a, b) => time(b.updatedAt) - time(a.updatedAt),
      newest: (a, b) => time(b.createdAt) - time(a.createdAt),
      oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(sorters[sort]);
  }, [posts, query, status, blogFilter, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  useEffect(() => setPage(1), [query, status, blogFilter, sort]);
  // Drop selections that a filter or a delete has hidden.
  useEffect(() => {
    const ids = new Set(filtered.map((post) => post.id));
    setSelected((list) => (list.every((id) => ids.has(id)) ? list : list.filter((id) => ids.has(id))));
  }, [filtered]);

  const recentDrafts = posts.filter((post) => statusOf(post) === "draft").slice(0, 3);
  const usedBlogs = blogs.filter((blog) => posts.some((post) => post.blogId === blog.id));
  const blogOptions = [
    { value: "all", label: "All blogs" },
    ...(usedBlogs.length ? usedBlogs : blogs).map((blog) => ({ value: blog.id, label: blog.title })),
    ...(posts.some((post) => !post.blogId) ? [{ value: "none", label: "No blog chosen" }] : []),
  ];

  const showOnly = (next) => {
    setStatus(next);
    setBlogFilter("all");
    setQuery("");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const allVisibleSelected = visible.length > 0 && visible.every((post) => selected.includes(post.id));
  const toggleAll = (checked) =>
    setSelected((list) => (checked ? [...new Set([...list, ...visible.map((post) => post.id)])] : list.filter((id) => !visible.some((post) => post.id === id))));
  const toggleOne = (id, checked) => setSelected((list) => (checked ? [...list, id] : list.filter((item) => item !== id)));

  const actionsFor = (post) => ({
    disabled: busy,
    liveUrl: liveUrlOf(post),
    onEdit: () => navigate(`/app/blog/${post.id}`),
    onDuplicate: () => fetcher.submit({ intent: "duplicate", id: post.id }, { method: "post" }),
    onDelete: () => setDeleteTarget({ ...post, ids: [post.id] }),
  });
  const filtersActive = query || status !== "all" || blogFilter !== "all";
  const selectedPosts = posts.filter((post) => selected.includes(post.id));

  return (
    <Page fullWidth>
      <div className="bl">
        <header className="bl-header">
          <span className="bl-tile bl-tile--blue bl-tile--lg" aria-hidden="true">
            <BlogIcon />
          </span>
          <div className="bl-header__text">
            <h1>Blog Builder</h1>
            <p>Design blog posts with drag and drop, then publish them straight to your Shopify blog.</p>
          </div>
          <div className="bl-header__actions">
            <Button icon={ImportIcon} size="large" onClick={() => setImporting(true)}>
              Import posts
            </Button>
            <Button variant="primary" icon={PlusIcon} size="large" onClick={() => setCreating(true)}>
              Create post
            </Button>
          </div>
        </header>

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

        <div className="bl-body">
          <div className="bl-main">
            <div className="bl-stats">
              <StatCard
                icon={BlogIcon}
                tone="blue"
                label="Total posts"
                value={stats.total}
                delta={stats.totalNew}
                menu={[{ content: "Show all posts", onAction: () => showOnly("all") }]}
              />
              <StatCard
                icon={CheckCircleIcon}
                tone="green"
                label="Published"
                value={stats.published}
                delta={stats.publishedNew}
                menu={[{ content: "Show published posts", onAction: () => showOnly("published") }]}
              />
              <StatCard
                icon={NoteIcon}
                tone="gray"
                label="Drafts"
                value={stats.drafts}
                note={stats.drafts ? "Not published yet" : "Nothing waiting"}
                menu={[{ content: "Show drafts", onAction: () => showOnly("draft") }]}
              />
            </div>

            <section className="bl-card bl-posts" ref={tableRef}>
              <div className="bl-posts__head">
                <h2>Blog posts</h2>
                <Button icon={ThemeTemplateIcon} onClick={() => setCreating(true)}>
                  View templates
                </Button>
              </div>

              <div className="bl-toolbar">
                <div className="bl-search">
                  <TextField
                    label="Search posts"
                    labelHidden
                    prefix={<Icon source={SearchIcon} tone="subdued" />}
                    placeholder="Search posts..."
                    value={query}
                    onChange={setQuery}
                    clearButton
                    onClearButtonClick={() => setQuery("")}
                    autoComplete="off"
                  />
                </div>
                <MenuSelect label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
                <MenuSelect label="Blog" options={blogOptions} value={blogFilter} onChange={setBlogFilter} />
                <MenuSelect label="Sort by" options={SORT_OPTIONS} value={sort} onChange={setSort} alwaysShowValue />
                <div className="bl-viewtoggle" role="group" aria-label="View">
                  <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => changeView("list")}>
                    <ListBulletedIcon />
                  </button>
                  <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => changeView("grid")}>
                    <AppsIcon />
                  </button>
                </div>
              </div>

              {selected.length > 0 && (
                <div className="bl-bulkbar">
                  <strong>{selected.length} selected</strong>
                  <Button size="slim" tone="critical" icon={DeleteIcon} onClick={() => setDeleteTarget({ ids: selected, title: `${selected.length} posts`, linked: selectedPosts.some((post) => post.articleId) })}>
                    Delete
                  </Button>
                  <Button size="slim" variant="plain" onClick={() => setSelected([])}>
                    Clear selection
                  </Button>
                </div>
              )}

              {posts.length === 0 ? (
                <div className="bl-empty">
                  <span className="bl-tile bl-tile--blue bl-tile--lg" aria-hidden="true">
                    <BlogIcon />
                  </span>
                  <strong>Design your first blog post</strong>
                  <p>Drag in headings, images, columns, buttons and more. Publishing saves the design into your blog post.</p>
                  <InlineStack gap="200" align="center">
                    <Button variant="primary" icon={PlusIcon} onClick={() => setCreating(true)}>
                      Create post
                    </Button>
                    {articles.length > 0 && <Button onClick={() => setImporting(true)}>Import from Shopify</Button>}
                  </InlineStack>
                </div>
              ) : filtered.length === 0 ? (
                <div className="bl-empty">
                  <strong>No posts match your filters</strong>
                  <p>Try a different search or clear the filters.</p>
                  <Button
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                      setBlogFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : view === "list" ? (
                <div className="bl-tablewrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th className="bl-col-check">
                          <Checkbox label="Select all posts on this page" labelHidden checked={allVisibleSelected} onChange={toggleAll} />
                        </th>
                        <th>Post</th>
                        <th>Status</th>
                        <th>Blog</th>
                        <th>Author</th>
                        <th>Last edited</th>
                        <th className="bl-col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((post) => (
                        <tr key={post.id} className={selected.includes(post.id) ? "is-selected" : undefined}>
                          <td className="bl-col-check">
                            <Checkbox label={`Select ${post.title}`} labelHidden checked={selected.includes(post.id)} onChange={(checked) => toggleOne(post.id, checked)} />
                          </td>
                          <td>
                            <Link to={`/app/blog/${post.id}`} className="bl-post">
                              <Thumb post={post} />
                              <span className="bl-post__text">
                                <strong>{post.title}</strong>
                                <span>{post.excerpt || "No summary yet"}</span>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <StatusBadge post={post} />
                          </td>
                          <td className="bl-muted">{post.blogId ? blogTitle(post.blogId) : "—"}</td>
                          <td>
                            <Author name={post.author} />
                          </td>
                          <td className="bl-date">
                            {formatDay(post.updatedAt)}
                            <span>{formatTime(post.updatedAt)}</span>
                          </td>
                          <td className="bl-col-actions">
                            <RowActions title={post.title} {...actionsFor(post)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bl-grid">
                  {visible.map((post) => (
                    <article key={post.id} className={`bl-gridcard${selected.includes(post.id) ? " is-selected" : ""}`}>
                      <Link to={`/app/blog/${post.id}`} className="bl-gridcard__media">
                        <Thumb post={post} large />
                      </Link>
                      <div className="bl-gridcard__check">
                        <Checkbox label={`Select ${post.title}`} labelHidden checked={selected.includes(post.id)} onChange={(checked) => toggleOne(post.id, checked)} />
                      </div>
                      <div className="bl-gridcard__body">
                        <div className="bl-gridcard__top">
                          <StatusBadge post={post} />
                          <RowActions title={post.title} {...actionsFor(post)} />
                        </div>
                        <Link to={`/app/blog/${post.id}`} className="bl-gridcard__title">
                          {post.title}
                        </Link>
                        <p>{post.excerpt || "No summary yet"}</p>
                        <div className="bl-gridcard__meta">
                          <Author name={post.author} />
                          <span>{formatDay(post.updatedAt)}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {filtered.length > 0 && (
                <div className="bl-foot">
                  <span>
                    Showing {(current - 1) * PAGE_SIZE + 1}–{(current - 1) * PAGE_SIZE + visible.length} of {filtered.length} {filtered.length === 1 ? "post" : "posts"}
                    {filtersActive && posts.length !== filtered.length ? ` (${posts.length} in total)` : ""}
                  </span>
                  <div className="bl-pager">
                    <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>
                      <ChevronLeftIcon />
                    </button>
                    {Array.from({ length: pages }, (_, index) => index + 1).map((n) => (
                      <button key={n} type="button" aria-current={n === current ? "page" : undefined} onClick={() => setPage(n)}>
                        {n}
                      </button>
                    ))}
                    <button type="button" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>
                      <ChevronRightIcon />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="bl-side">
            <section className="bl-card">
              <h2 className="bl-side__title">
                <MagicIcon className="bl-side__icon bl-side__icon--blue" aria-hidden="true" />
                Quick actions
              </h2>
              <div className="bl-quick">
                <QuickAction icon={PlusIcon} label="Create new post" onClick={() => setCreating(true)} />
                <QuickAction icon={ImportIcon} label="Import from Shopify" onClick={() => setImporting(true)} />
                <QuickAction icon={ThemeTemplateIcon} label="Browse templates" onClick={() => setCreating(true)} />
              </div>
            </section>

            <section className="bl-card">
              <div className="bl-side__head">
                <h2 className="bl-side__title">
                  <NoteIcon className="bl-side__icon bl-side__icon--blue" aria-hidden="true" />
                  Recent drafts
                </h2>
                {stats.drafts > 0 && (
                  <Button variant="plain" onClick={() => showOnly("draft")}>
                    View all
                  </Button>
                )}
              </div>
              {recentDrafts.length === 0 ? (
                <p className="bl-side__empty">No drafts right now.</p>
              ) : (
                <ul className="bl-drafts">
                  {recentDrafts.map((post) => (
                    <li key={post.id}>
                      <Link to={`/app/blog/${post.id}`}>
                        <Thumb post={post} />
                        <span>
                          <strong>{post.title}</strong>
                          <span>{formatDay(post.updatedAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bl-card">
              <h2 className="bl-side__title">
                <BookOpenIcon className="bl-side__icon bl-side__icon--purple" aria-hidden="true" />
                Helpful resources
              </h2>
              <div className="bl-resources">
                {RESOURCES.map((entry) => (
                  <button key={entry.key} type="button" className="bl-resource" onClick={() => setResource(entry)}>
                    <span className={`bl-tile bl-tile--${entry.tone}`} aria-hidden="true">
                      <entry.icon />
                    </span>
                    <span className="bl-resource__text">
                      <strong>{entry.title}</strong>
                      <span>{entry.hint}</span>
                    </span>
                    <ChevronRightIcon className="bl-resource__chev" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <CreateModal open={creating} blogs={blogs} onClose={() => setCreating(false)} />

      <ImportModal
        open={importing}
        onClose={() => setImporting(false)}
        articles={articles}
        truncated={articlesTruncated}
        importer={importer}
        formatDay={formatDay}
      />

      <Modal open={Boolean(resource)} onClose={() => setResource(null)} title={resource?.title || ""} secondaryActions={[{ content: "Close", onAction: () => setResource(null) }]}>
        <Modal.Section>
          <ol className="bl-guide">
            {resource?.steps.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.ids?.length > 1 ? `Delete ${deleteTarget.ids.length} posts?` : `Delete “${deleteTarget?.title}”?`}
        primaryAction={{
          content: "Delete",
          destructive: true,
          loading: busy,
          onAction: () =>
            fetcher.submit(
              {
                intent: "delete",
                ids: JSON.stringify(deleteTarget.ids),
                deleteArticle: String(deleteTarget.deleteArticle !== false && Boolean(deleteTarget.articleId || deleteTarget.linked)),
              },
              { method: "post" },
            ),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              {deleteTarget?.ids?.length > 1 ? "This removes these posts from the editor." : "This removes the post from the editor."} This can&apos;t be undone.
            </Text>
            {(deleteTarget?.articleId || deleteTarget?.linked) && (
              <Checkbox
                label={deleteTarget.ids.length > 1 ? "Also delete their articles from my Shopify blog" : "Also delete the article from my Shopify blog"}
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

function StatCard({ icon: IconSource, tone, label, value, delta, note, menu }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bl-card bl-stat">
      <span className={`bl-tile bl-tile--${tone} bl-tile--lg`} aria-hidden="true">
        <IconSource />
      </span>
      <div className="bl-stat__text">
        <span className="bl-stat__label">{label}</span>
        <strong className="bl-stat__value">{value}</strong>
        {note !== undefined ? (
          <span className="bl-stat__note">{note}</span>
        ) : delta > 0 ? (
          <span className="bl-stat__delta">
            <ArrowUpIcon aria-hidden="true" />
            {delta} this month
          </span>
        ) : (
          <span className="bl-stat__note">None this month</span>
        )}
      </div>
      <div className="bl-stat__menu">
        <Popover
          active={open}
          onClose={() => setOpen(false)}
          preferredAlignment="right"
          activator={<Button variant="tertiary" icon={MenuHorizontalIcon} accessibilityLabel={`${label} options`} onClick={() => setOpen((v) => !v)} />}
        >
          <ActionList actionRole="menuitem" items={menu} onActionAnyItem={() => setOpen(false)} />
        </Popover>
      </div>
    </div>
  );
}

// A compact dropdown button: "Status ▾", or "Status: Published ▾" once set.
function MenuSelect({ label, options, value, onChange, alwaysShowValue = false }) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  const isDefault = value === options[0]?.value;
  const text = alwaysShowValue || !isDefault ? `${label}: ${chosen?.label || ""}` : label;
  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      activator={
        <Button disclosure onClick={() => setOpen((v) => !v)} pressed={!alwaysShowValue && !isDefault}>
          {text}
        </Button>
      }
    >
      <ActionList
        actionRole="menuitemradio"
        items={options.map((option) => ({
          content: option.label,
          active: option.value === value,
          onAction: () => {
            onChange(option.value);
            setOpen(false);
          },
        }))}
      />
    </Popover>
  );
}

function Thumb({ post, large = false }) {
  const [failed, setFailed] = useState(false);
  const className = `bl-thumb${large ? " bl-thumb--lg" : ""}`;
  if (post.image && !failed) return <img className={className} src={post.image} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return (
    <span className={`${className} bl-thumb--empty`} aria-hidden="true">
      <ImageIcon />
    </span>
  );
}

function StatusBadge({ post }) {
  const badge = STATUS_BADGE[statusOf(post)];
  return <Badge tone={badge.tone}>{badge.label}</Badge>;
}

function Author({ name }) {
  if (!name) return <span className="bl-muted">—</span>;
  return (
    <span className="bl-author">
      <span className="bl-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      {name}
    </span>
  );
}

function QuickAction({ icon: IconSource, label, onClick }) {
  return (
    <button type="button" className="bl-quick__item" onClick={onClick}>
      <IconSource className="bl-quick__icon" aria-hidden="true" />
      <span>{label}</span>
      <ChevronRightIcon className="bl-quick__chev" aria-hidden="true" />
    </button>
  );
}

function RowActions({ title, disabled, liveUrl, onEdit, onDuplicate, onDelete }) {
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
      preferredAlignment="right"
      activator={<Button icon={MenuHorizontalIcon} accessibilityLabel={`Actions for ${title}`} onClick={() => setActive((value) => !value)} disabled={disabled} />}
    >
      <ActionList actionRole="menuitem" items={items} onActionAnyItem={() => setActive(false)} />
    </Popover>
  );
}

// Posts written in Shopify that aren't in the builder yet.
function ImportModal({ open, onClose, articles, truncated, importer, formatDay }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const list = needle ? articles.filter((article) => `${article.title} ${article.blog?.title || ""}`.toLowerCase().includes(needle)) : articles;
  return (
    <Modal open={open} onClose={onClose} title="Import posts from Shopify" size="large" secondaryActions={[{ content: "Close", onAction: onClose }]}>
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            Open a post you wrote in Shopify in the builder to edit it with drag and drop. Publishing updates the same post and keeps
            its address.
          </Text>
          {articles.length === 0 ? (
            <div className="bl-empty">
              <strong>Nothing to import</strong>
              <p>Every post in your Shopify blogs is already in the Blog Builder.</p>
            </div>
          ) : (
            <>
              <TextField
                label="Search Shopify posts"
                labelHidden
                prefix={<Icon source={SearchIcon} tone="subdued" />}
                placeholder="Search Shopify posts..."
                value={query}
                onChange={setQuery}
                autoComplete="off"
              />
              <ul className="bl-importlist">
                {list.map((article) => (
                  <li key={article.id}>
                    <span className="bl-importlist__text">
                      <strong>{article.title}</strong>
                      <span>
                        {article.blog?.title || "—"} · {article.isPublished ? "Published" : "Hidden"} · Edited {formatDay(article.updatedAt)}
                      </span>
                    </span>
                    <Button
                      icon={EditIcon}
                      loading={importer.activeId === article.id}
                      disabled={Boolean(importer.activeId) && importer.activeId !== article.id}
                      onClick={() => importer.start(article.id)}
                    >
                      Edit in builder
                    </Button>
                  </li>
                ))}
                {list.length === 0 && <li className="bl-muted">No posts match “{query}”.</li>}
              </ul>
              {truncated && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing your 250 most recently edited posts.
                </Text>
              )}
            </>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
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
