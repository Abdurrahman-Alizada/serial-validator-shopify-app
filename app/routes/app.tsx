import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Determine which tab is active based on current path
  const isDashboardActive = location.pathname === "/app";
  const isProductsActive = location.pathname === "/app/products" || location.pathname.startsWith("/app/products/");

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div style={{ display: "flex", height: "100vh" }}>
        {/* Sidebar Navigation */}
        <nav style={{ 
          width: "240px", 
          backgroundColor: "#f9fafb", 
          borderRight: "1px solid #e5e7eb",
          padding: "1rem 0"
        }}>
          <div style={{ padding: "0 1rem", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: "600", margin: 0 }}>Serial Tracker</h2>
          </div>
          <div style={{ padding: "0 0.5rem" }}>
            <div style={{ 
              display: "block", 
              padding: "0.75rem 1rem", 
              marginBottom: "0.25rem",
              borderRadius: "0.375rem",
              backgroundColor: isDashboardActive ? "#dbeafe" : "transparent",
            }}>
              <s-link href="/app">
                📊 Dashboard
              </s-link>
            </div>
            <div style={{ 
              display: "block", 
              padding: "0.75rem 1rem", 
              borderRadius: "0.375rem",
              backgroundColor: isProductsActive ? "#dbeafe" : "transparent",
            }}>
              <s-link href="/app/products">
                📦 Products
              </s-link>
            </div>
          </div>
        </nav>
        
        {/* Main Content Area */}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
