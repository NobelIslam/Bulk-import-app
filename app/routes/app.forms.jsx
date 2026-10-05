import { Outlet, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Layout for every /app/forms route. The Polaris stylesheet is imported by each
// leaf route instead of here, so it ships as its own chunk and is only fetched
// when the merchant opens the Form Builder — never on the Bulk Page Importer or
// Metaobject Editor pages.
export default function FormsLayout() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};