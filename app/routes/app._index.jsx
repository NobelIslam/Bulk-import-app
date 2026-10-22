import { useState } from "react";
import { useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ActionList, Button, InlineStack, Modal, Page, Popover } from "@shopify/polaris";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ComposeIcon,
  DatabaseIcon,
  EnvelopeIcon,
  ExternalIcon,
  FormsIcon,
  ImageIcon,
  MenuHorizontalIcon,
  PageAddIcon,
  PlayCircleIcon,
  QuestionCircleIcon,
} from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import "../components/home/home.css";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { listActivity } from "../activity.server";

const APP_NAME = "Metaobject Updater";

// External help links. Leave one empty to open the in-app getting started
// guide instead, so no button ever leads to a dead page.
const RESOURCES = {
  documentation: "",
  videos: "",
  support: "",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const count = (query) => query.catch(() => null);
  const [posts, published, forms, liveForms, unread, activity] = await Promise.all([
    count(db.blogPost.count({ where: { shop } })),
    count(db.blogPost.count({ where: { shop, status: "PUBLISHED" } })),
    count(db.form.count({ where: { shop } })),
    count(db.form.count({ where: { shop, status: "PUBLISHED" } })),
    count(db.submission.count({ where: { shop, isRead: false } })),
    listActivity(shop, 30).catch(() => []),
  ]);
  return { posts, published, forms, liveForms, unread, activity };
};

// ─── Tools ───────────────────────────────────────────────────────────────────

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const TOOLS = {
  metaobjects: {
    name: "Metaobject & Metafields Editor",
    quick: "Open Metaobject Editor",
    quickHint: "Manage metaobjects and metafields in one place",
    url: "/app/metaobjects",
    icon: DatabaseIcon,
    tone: "purple",
    description: "Bulk edit metaobjects and the metafields of products, collections, pages and blog posts in one grid, with CSV import and export.",
    action: "Edit metaobjects",
  },
  pages: {
    name: "Page Importer",
    quick: "Import Pages",
    quickHint: "Upload a CSV and create many pages at once",
    url: "/app/page-importer",
    icon: PageAddIcon,
    tone: "green",
    description: "Create many store pages at once by uploading a CSV file.",
    action: "Import pages",
  },
  blog: {
    name: "Blog Builder",
    quick: "Open Blog Builder",
    quickHint: "Create and publish blog posts",
    url: "/app/blog",
    icon: ComposeIcon,
    tone: "blue",
    description: "Design blog posts with drag and drop and publish them straight to your Shopify blog.",
    action: "Open Blog Builder",
    stat: ({ posts, published }) => (posts === null ? null : `${plural(posts, "post")} · ${published} published`),
  },
  forms: {
    name: "Form Builder",
    quick: "Open Form Builder",
    quickHint: "Build forms for your storefront",
    url: "/app/forms",
    icon: FormsIcon,
    tone: "orange",
    description: "Build contact, newsletter, quote and other forms with drag and drop, then add them to your theme.",
    action: "Open Form Builder",
    stat: ({ forms, liveForms }) => (forms === null ? null : `${plural(forms, "form")} · ${liveForms} published`),
  },
  submissions: {
    name: "Form Submissions",
    quick: "View Form Submissions",
    quickHint: "Manage and review customer responses",
    url: "/app/submissions",
    icon: EnvelopeIcon,
    tone: "pink",
    description: "Read, search and manage every response your forms collect.",
    action: "View submissions",
    stat: ({ unread }) => (unread === null ? null : unread ? plural(unread, "unread response") : "All caught up"),
  },
};

const QUICK = ["metaobjects", "pages", "blog", "forms", "submissions"];

// ─── Activity ────────────────────────────────────────────────────────────────

function splitLabel(label) {
  const at = label.indexOf(":");
  return at === -1 ? ["", label] : [label.slice(0, at), label.slice(at + 1)];
}

const ACTIVITY = {
  pages_imported: { tool: "pages", text: (a) => `Imported ${plural(a.count, "page")} from CSV` },
  bulk_saved: {
    tool: "metaobjects",
    text: (a) => {
      const [kind, label] = splitLabel(a.label);
      return kind === "metafields"
        ? `Updated metafields on ${plural(a.count, label.toLowerCase().replace(/s$/, ""), label.toLowerCase())}`
        : `Updated ${plural(a.count, `${label} entry`, `${label} entries`)}`;
    },
  },
  blog_published: { tool: "blog", text: (a) => (a.count > 1 ? `Published ${a.count} blog post updates` : `Published “${a.label || "a blog post"}”`) },
  form_created: { tool: "forms", text: (a) => (a.count > 1 ? `Created ${a.count} forms` : `Created a new form “${a.label}”`) },
  form_published: { tool: "forms", text: (a) => `Published form “${a.label}”` },
  submissions_received: { tool: "submissions", text: (a) => `Received ${plural(a.count, "new form submission")}${a.label ? ` · ${a.label}` : ""}` },
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [
  [3600, "minute", 60],
  [86400, "hour", 3600],
  [604800, "day", 86400],
  [2629800, "week", 604800],
  [31557600, "month", 2629800],
];
function timeAgo(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "Just now";
  for (const [limit, unit, size] of UNITS) {
    if (abs < limit) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return RELATIVE.format(Math.round(seconds / 31557600), "year");
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const stats = useLoaderData();
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const openResource = (key) => {
    if (RESOURCES[key]) window.open(RESOURCES[key], "_blank", "noopener");
    else setGuideOpen(true);
  };

  return (
    <Page fullWidth>
      <div className="hm">
        <section className="hm-hero">
          <div className="hm-hero__text">
            <p className="hm-eyebrow">{APP_NAME}</p>
            <h1>Manage and update your store content with ease</h1>
            <p>Build blog posts, import pages, edit metaobjects and metafields, create forms and manage submissions — all in one place.</p>
            <div className="hm-hero__actions">
              <Button variant="primary" size="large" onClick={() => setGuideOpen(true)}>
                <ArrowLabel>Get started</ArrowLabel>
              </Button>
              <Button size="large" icon={ExternalIcon} onClick={() => openResource("documentation")}>
                View documentation
              </Button>
            </div>
          </div>
          <HeroArt />
        </section>

        <section>
          <h2>Quick actions</h2>
          <p className="hm-sub">Jump into the most common tasks.</p>
          <div className="hm-quick">
            {QUICK.map((key) => {
              const tool = TOOLS[key];
              return (
                <button key={key} type="button" className="hm-quick__item" onClick={() => navigate(tool.url)}>
                  <Tile tool={tool} />
                  <span className="hm-quick__text">
                    <strong>{tool.quick}</strong>
                    <span>{tool.quickHint}</span>
                  </span>
                  <ChevronRightIcon className="hm-quick__chev" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        <div className="hm-body">
          <div className="hm-col">
            <section>
              <h2>Content Tools</h2>
              <p className="hm-sub">Create and manage your content with powerful tools.</p>
              <div className="hm-tools hm-tools--3">
                {["blog", "pages", "metaobjects"].map((key) => (
                  <ToolCard key={key} tool={TOOLS[key]} stats={stats} onOpen={navigate} onGuide={() => setGuideOpen(true)} />
                ))}
              </div>
            </section>
            <section>
              <h2>Forms</h2>
              <p className="hm-sub">Build forms for your storefront and manage the responses they collect.</p>
              <div className="hm-tools hm-tools--2">
                {["forms", "submissions"].map((key) => (
                  <ToolCard key={key} tool={TOOLS[key]} stats={stats} onOpen={navigate} onGuide={() => setGuideOpen(true)} />
                ))}
              </div>
            </section>
          </div>

          <div className="hm-col" style={{ gap: 16 }}>
            <section className="hm-side">
              <div className="hm-side__head">
                <h2>Recent activity</h2>
                {stats.activity.length > 5 && (
                  <Button variant="plain" onClick={() => setActivityOpen(true)}>
                    <ArrowLabel>View all</ArrowLabel>
                  </Button>
                )}
              </div>
              <ActivityList items={stats.activity.slice(0, 5)} onOpen={navigate} />
            </section>

            <section className="hm-side">
              <div className="hm-side__head">
                <h2>Help &amp; resources</h2>
              </div>
              <HelpLink tone="blue" icon={BookOpenIcon} title="Documentation" hint={`Learn how to get the most out of ${APP_NAME}`} onClick={() => openResource("documentation")} />
              <HelpLink tone="green" icon={PlayCircleIcon} title="Video tutorials" hint="Watch step-by-step guides" onClick={() => openResource("videos")} />
              <HelpLink tone="purple" icon={QuestionCircleIcon} title="Get support" hint="Need help? Contact our support team" onClick={() => openResource("support")} />
            </section>
          </div>
        </div>
      </div>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title={`Getting started with ${APP_NAME}`} size="large">
        <Modal.Section>
          <div className="hm-guide">
            {[TOOLS.blog, TOOLS.pages, TOOLS.metaobjects, TOOLS.forms, TOOLS.submissions].map((tool, index) => (
              <div key={tool.url} className="hm-guide__step">
                <Tile tool={tool} />
                <div>
                  <strong>{`${index + 1}. ${tool.name}`}</strong>
                  <p>{tool.description}</p>
                  <Button
                    size="slim"
                    onClick={() => {
                      setGuideOpen(false);
                      navigate(tool.url);
                    }}
                  >
                    {tool.action}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Modal.Section>
      </Modal>

      <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Recent activity">
        <Modal.Section>
          <ActivityList
            items={stats.activity}
            onOpen={(url) => {
              setActivityOpen(false);
              navigate(url);
            }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ArrowLabel({ children }) {
  return (
    <InlineStack gap="150" blockAlign="center" wrap={false}>
      <span>{children}</span>
      <ArrowRightIcon width={16} height={16} fill="currentColor" aria-hidden="true" style={{ display: "block" }} />
    </InlineStack>
  );
}

function Tile({ tool, small = false }) {
  const Icon = tool.icon;
  return (
    <span className={`hm-tile hm-tile--${tool.tone}${small ? " hm-tile--sm" : ""}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

function ToolCard({ tool, stats, onOpen, onGuide }) {
  const [menu, setMenu] = useState(false);
  const stat = tool.stat?.(stats);
  return (
    <div className="hm-tool">
      <div className="hm-tool__head">
        <Tile tool={tool} />
        <div className="hm-tool__text">
          <strong>{tool.name}</strong>
          <p>{tool.description}</p>
        </div>
        <Popover
          active={menu}
          onClose={() => setMenu(false)}
          preferredAlignment="right"
          activator={<Button variant="tertiary" icon={MenuHorizontalIcon} accessibilityLabel={`More actions for ${tool.name}`} onClick={() => setMenu((v) => !v)} />}
        >
          <ActionList
            actionRole="menuitem"
            onActionAnyItem={() => setMenu(false)}
            items={[
              { content: `Open ${tool.name}`, onAction: () => onOpen(tool.url) },
              { content: "Getting started guide", onAction: onGuide },
            ]}
          />
        </Popover>
      </div>
      <div className="hm-tool__foot">
        {stat && <span className="hm-tool__stat">{stat}</span>}
        <div>
          <Button variant="primary" onClick={() => onOpen(tool.url)}>
            <ArrowLabel>{tool.action}</ArrowLabel>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActivityList({ items, onOpen }) {
  if (!items.length) {
    return <p className="hm-empty">Nothing yet. Imports, saves, publishes and new submissions will show up here.</p>;
  }
  return (
    <ul className="hm-activity">
      {items.map((item) => {
        const meta = ACTIVITY[item.kind];
        if (!meta) return null;
        const tool = TOOLS[meta.tool];
        return (
          <li key={item.id}>
            <Tile tool={tool} small />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{meta.text(item)}</strong>
              <span className="hm-when">{timeAgo(item.updatedAt)}</span>
            </div>
            <Button variant="tertiary" icon={ChevronRightIcon} accessibilityLabel={`Open ${tool.name}`} onClick={() => onOpen(tool.url)} />
          </li>
        );
      })}
    </ul>
  );
}

function HelpLink({ tone, icon, title, hint, onClick }) {
  return (
    <button type="button" className="hm-help" onClick={onClick}>
      <Tile tool={{ tone, icon }} small />
      <div>
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <ExternalIcon className="hm-help__ext" aria-hidden="true" />
    </button>
  );
}

function HeroArt() {
  const card = (Icon, tone) => (
    <div className="hm-art__card">
      <span className={`hm-tile hm-tile--${tone}`}>
        <Icon />
      </span>
      <div className="hm-art__lines">
        <span />
        <span />
      </div>
    </div>
  );
  return (
    <div className="hm-art" aria-hidden="true">
      <div className="hm-art__blob" />
      {card(PageAddIcon, "blue")}
      {card(ImageIcon, "green")}
      {card(DatabaseIcon, "purple")}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
