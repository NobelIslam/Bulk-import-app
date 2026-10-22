import db from "../db.server";
import { docFromTemplate, normalizeDoc, postSummary, renderDocHtml, summaryHtml } from "./blocks";

// Every query is scoped by `shop`, which always comes from the admin session.

export async function listPosts(shop) {
  const rows = await db.blogPost.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      doc: true,
      blogId: true,
      blogHandle: true,
      articleHandle: true,
      articleId: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  // The full design stays on the server; the list only needs its summary.
  return rows.map(({ doc, ...row }) => {
    const summary = postSummary(doc);
    return { ...row, ...summary, blogId: row.blogId || summary.blogId };
  });
}

export async function getPost(shop, id) {
  return db.blogPost.findFirst({ where: { id, shop } });
}

export async function createPost(shop, { template = "blank", title, blogId } = {}) {
  const doc = docFromTemplate(template);
  if (title) doc.post.title = String(title).slice(0, 255);
  if (blogId) doc.post.blogId = blogId;
  const normalized = normalizeDoc(doc);
  return db.blogPost.create({
    data: { shop, title: normalized.post.title, doc: normalized, blogId: normalized.post.blogId || null },
  });
}

export async function savePost(shop, id, rawDoc) {
  const existing = await getPost(shop, id);
  if (!existing) return null;
  const doc = normalizeDoc(rawDoc);
  return db.blogPost.update({
    where: { id },
    data: { doc, title: doc.post.title, blogId: doc.post.blogId || existing.blogId },
  });
}

export async function duplicatePost(shop, id) {
  const source = await getPost(shop, id);
  if (!source) return null;
  const doc = normalizeDoc(source.doc);
  doc.post.title = `${doc.post.title} (copy)`.slice(0, 255);
  doc.post.handle = "";
  return db.blogPost.create({ data: { shop, title: doc.post.title, doc, blogId: source.blogId } });
}

// ─── Shopify ─────────────────────────────────────────────────────────────────

async function gql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  return body.data;
}

export async function listBlogs(admin) {
  const data = await gql(
    admin,
    `#graphql
    query BlogEditorBlogs {
      blogs(first: 50) {
        nodes { id title handle }
      }
      shop { name myshopifyDomain primaryDomain { url } }
    }`,
  );
  return { blogs: data.blogs.nodes, shop: data.shop };
}

const ARTICLE_FIELDS = `
  id
  handle
  isPublished
  blog { id handle }
`;

function articleInput(doc, { publish, shopName }) {
  const { post } = doc;
  const tags = post.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 250);
  const metafields = [];
  if (post.seoTitle) metafields.push({ namespace: "global", key: "title_tag", type: "single_line_text_field", value: post.seoTitle });
  if (post.seoDescription) {
    metafields.push({ namespace: "global", key: "description_tag", type: "single_line_text_field", value: post.seoDescription });
  }
  const input = {
    title: post.title,
    body: renderDocHtml(doc),
    summary: summaryHtml(post.summary),
    tags,
    author: { name: post.author || shopName || "Store" },
    isPublished: publish,
  };
  if (post.handle) input.handle = post.handle;
  if (post.image) input.image = { url: post.image, altText: post.imageAlt || post.title };
  if (metafields.length) input.metafields = metafields;
  return input;
}

function userErrorMessage(errors) {
  return errors.map((error) => error.message).join(" ");
}

// Saves the post, then creates or updates its Shopify article with the
// rendered HTML. `publish` decides whether the article is visible.
export async function publishPost(admin, shop, id, rawDoc, { publish = true } = {}) {
  const saved = await savePost(shop, id, rawDoc);
  if (!saved) return { ok: false, message: "Post not found." };
  const doc = saved.doc;
  if (!doc.post.blogId) return { ok: false, message: "Choose a blog in Post settings before publishing." };

  const { shop: shopInfo } = await listBlogs(admin);
  const input = articleInput(doc, { publish, shopName: shopInfo.name });

  let article = null;
  let errors = [];

  if (saved.articleId) {
    const data = await gql(
      admin,
      `#graphql
      mutation BlogEditorUpdate($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { ${ARTICLE_FIELDS} }
          userErrors { field message }
        }
      }`,
      { id: saved.articleId, article: { ...input, blogId: doc.post.blogId, redirectNewHandle: true } },
    );
    article = data.articleUpdate.article;
    errors = data.articleUpdate.userErrors;
    // The article was deleted in Shopify: publish a fresh one instead.
    if (!article && errors.some((error) => /not (exist|found)/i.test(error.message))) errors = [];
  }

  if (!article && errors.length === 0) {
    const data = await gql(
      admin,
      `#graphql
      mutation BlogEditorCreate($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { ${ARTICLE_FIELDS} }
          userErrors { field message }
        }
      }`,
      { article: { ...input, blogId: doc.post.blogId } },
    );
    article = data.articleCreate.article;
    errors = data.articleCreate.userErrors;
  }

  if (!article) return { ok: false, message: userErrorMessage(errors) || "Shopify didn't accept the article." };

  await db.blogPost.update({
    where: { id },
    data: {
      articleId: article.id,
      articleHandle: article.handle,
      blogId: article.blog?.id || doc.post.blogId,
      blogHandle: article.blog?.handle || null,
      status: article.isPublished ? "PUBLISHED" : "DRAFT",
      publishedAt: article.isPublished ? new Date() : null,
    },
  });

  return {
    ok: true,
    message: publish ? "Published to your blog." : "Saved to Shopify as hidden.",
    articleHandle: article.handle,
    blogHandle: article.blog?.handle,
  };
}

export async function unpublishPost(admin, shop, id) {
  const post = await getPost(shop, id);
  if (!post) return { ok: false, message: "Post not found." };
  if (post.articleId) {
    const data = await gql(
      admin,
      `#graphql
      mutation BlogEditorHide($id: ID!) {
        articleUpdate(id: $id, article: { isPublished: false }) {
          article { id }
          userErrors { field message }
        }
      }`,
      { id: post.articleId },
    );
    const errors = data.articleUpdate.userErrors;
    if (errors.length && !errors.some((error) => /not (exist|found)/i.test(error.message))) {
      return { ok: false, message: userErrorMessage(errors) };
    }
  }
  await db.blogPost.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
  return { ok: true, message: "Hidden from your store." };
}

export async function deletePost(admin, shop, id, { deleteArticle = false } = {}) {
  const post = await getPost(shop, id);
  if (!post) return { ok: false, message: "Post not found." };
  if (deleteArticle && post.articleId) {
    const data = await gql(
      admin,
      `#graphql
      mutation BlogEditorDelete($id: ID!) {
        articleDelete(id: $id) {
          deletedArticleId
          userErrors { field message }
        }
      }`,
      { id: post.articleId },
    );
    const errors = data.articleDelete.userErrors;
    if (errors.length && !errors.some((error) => /not (exist|found)/i.test(error.message))) {
      return { ok: false, message: userErrorMessage(errors) };
    }
  }
  await db.blogPost.deleteMany({ where: { id, shop } });
  return { ok: true, message: deleteArticle ? "Post and Shopify article deleted." : "Post deleted from the editor." };
}

// ─── Existing Shopify articles ───────────────────────────────────────────────

// Recent articles across all blogs, newest edit first.
export async function listArticles(admin, { max = 250 } = {}) {
  const articles = [];
  let after = null;
  do {
    const data = await gql(
      admin,
      `#graphql
      query BlogEditorArticles($after: String) {
        articles(first: 100, after: $after, sortKey: UPDATED_AT, reverse: true) {
          nodes { id title handle isPublished updatedAt blog { id title handle } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
    );
    articles.push(...data.articles.nodes);
    after = data.articles.pageInfo.hasNextPage ? data.articles.pageInfo.endCursor : null;
  } while (after && articles.length < max);
  return { articles: articles.slice(0, max), truncated: Boolean(after) };
}

export async function getArticle(admin, id) {
  const data = await gql(
    admin,
    `#graphql
    query BlogEditorArticle($id: ID!) {
      article(id: $id) {
        id title handle body summary tags isPublished updatedAt
        image { url altText }
        author { name }
        blog { id handle }
        seoTitle: metafield(namespace: "global", key: "title_tag") { value }
        seoDescription: metafield(namespace: "global", key: "description_tag") { value }
      }
    }`,
    { id },
  );
  return data.article;
}

// Links an existing article to a new editor post. If one already exists for
// the article, that post is returned instead of creating a duplicate.
export async function importArticle(admin, shop, articleId, rawDoc) {
  const existing = await db.blogPost.findFirst({ where: { shop, articleId } });
  if (existing) return existing;
  const article = await getArticle(admin, articleId);
  if (!article) return null;
  const doc = normalizeDoc(rawDoc);
  doc.post.blogId = article.blog?.id || doc.post.blogId;
  return db.blogPost.create({
    data: {
      shop,
      title: doc.post.title,
      doc,
      status: article.isPublished ? "PUBLISHED" : "DRAFT",
      blogId: article.blog?.id || null,
      blogHandle: article.blog?.handle || null,
      articleId: article.id,
      articleHandle: article.handle,
      publishedAt: article.isPublished ? new Date() : null,
    },
  });
}
