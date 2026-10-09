import { authenticate } from "../shopify.server";

// Uploads an image from the form builder into the shop's Files (Content > Files)
// and returns its CDN URL, for image blocks and the two-column side panel.

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
const POLL_ATTEMPTS = 12;
const POLL_DELAY_MS = 1000;

const STAGED_UPLOAD = `#graphql
  mutation StageFormImage($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`;

const FILE_CREATE = `#graphql
  mutation CreateFormImage($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files { id fileStatus ... on MediaImage { image { url } } }
      userErrors { field message }
    }
  }`;

const FILE_STATUS = `#graphql
  query FormImageStatus($id: ID!) {
    node(id: $id) {
      ... on File { fileStatus preview { image { url } } }
      ... on MediaImage { image { url } }
    }
  }`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") return { ok: false, message: "Choose an image to upload." };
  if (!ALLOWED_TYPES.includes(file.type)) return { ok: false, message: "Use a PNG, JPG, GIF, WebP or SVG image." };
  if (file.size > MAX_BYTES) return { ok: false, message: "Images must be 10 MB or smaller." };

  const filename = String(file.name || "form-image").replace(/[^\w.-]+/g, "-").slice(0, 120);

  const staged = await (
    await admin.graphql(STAGED_UPLOAD, {
      variables: {
        input: [{ filename, mimeType: file.type, resource: "IMAGE", httpMethod: "PUT", fileSize: String(file.size) }],
      },
    })
  ).json();
  const target = staged.data?.stagedUploadsCreate?.stagedTargets?.[0];
  const stageError = staged.data?.stagedUploadsCreate?.userErrors?.[0]?.message;
  if (!target) return { ok: false, message: stageError || "Couldn't start the upload." };

  const headers = Object.fromEntries((target.parameters || []).map((param) => [param.name, param.value]));
  const uploaded = await fetch(target.url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": file.type },
    body: await file.arrayBuffer(),
  });
  if (!uploaded.ok) return { ok: false, message: "The upload was rejected. Try a different image." };

  const created = await (
    await admin.graphql(FILE_CREATE, {
      variables: { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt: filename }] },
    })
  ).json();
  const createdFile = created.data?.fileCreate?.files?.[0];
  const createError = created.data?.fileCreate?.userErrors?.[0]?.message;
  if (!createdFile) return { ok: false, message: createError || "Couldn't save the image." };

  // Shopify processes images asynchronously; the CDN URL appears once READY.
  let url = createdFile.image?.url || null;
  for (let attempt = 0; !url && attempt < POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_DELAY_MS);
    const status = await (await admin.graphql(FILE_STATUS, { variables: { id: createdFile.id } })).json();
    const node = status.data?.node;
    if (node?.fileStatus === "FAILED") return { ok: false, message: "Shopify couldn't process this image." };
    url = node?.image?.url || node?.preview?.image?.url || null;
  }

  if (!url) return { ok: false, message: "The image is still processing. Try again in a moment." };
  return { ok: true, url };
};
