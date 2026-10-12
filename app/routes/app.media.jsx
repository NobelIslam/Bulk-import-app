import { authenticate } from "../shopify.server";

// Resource route for the media library: lists the store's images from
// Content > Files, newest first, with search and cursor pagination.

const FILES = `#graphql
  query MediaLibrary($first: Int!, $after: String, $query: String) {
    files(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        alt
        createdAt
        fileStatus
        ... on MediaImage { image { url width height altText } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = (url.searchParams.get("q") || "").replace(/["\\]/g, "").trim().slice(0, 100);
  const after = url.searchParams.get("after") || null;
  const query = ["media_type:IMAGE", "status:READY", search ? `"${search}"` : ""].filter(Boolean).join(" ");

  try {
    const response = await admin.graphql(FILES, { variables: { first: 40, after, query } });
    const body = await response.json();
    if (body.errors?.length) return { ok: false, message: body.errors[0].message, files: [] };
    const connection = body.data.files;
    return {
      ok: true,
      files: connection.nodes
        .filter((node) => node.image?.url)
        .map((node) => ({
          id: node.id,
          url: node.image.url,
          alt: node.image.altText || node.alt || "",
          width: node.image.width,
          height: node.image.height,
        })),
      nextCursor: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null,
    };
  } catch (error) {
    return { ok: false, message: error.message || "Couldn't load your files.", files: [] };
  }
};
