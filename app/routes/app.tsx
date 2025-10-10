import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";

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
      <PolarisAppProvider i18n={{}}>
        <div style={{ display: "flex", height: "100vh" }}>
          {/* Sidebar Navigation */}
          <nav style={{
            width: "240px",
            backgroundColor: "#f9fafb",
            borderRight: "1px solid #e5e7eb",
            padding: "1.5rem 0"
          }}>


            {/* Navigation Items */}
            <div style={{ padding: "0 1rem" }}>
              <Link to="/app" style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  marginBottom: "0.25rem",
                  borderRadius: "0.5rem",
                  backgroundColor: isDashboardActive ? "#dcfce7" : "transparent",
                  color: isDashboardActive ? "#00A047" : "#6b7280",
                  fontWeight: isDashboardActive ? "500" : "400",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor"/>
                    <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor"/>
                    <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor"/>
                    <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor"/>
                  </svg>
                  Dashboard
                </div>
              </Link>

              <Link to="/app/products" style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: isProductsActive ? "#dcfce7" : "transparent",
                  color: isProductsActive ? "#00A047" : "#6b7280",
                  fontWeight: isProductsActive ? "500" : "400",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.5 7.27783L12 12.0001L3.5 7.27783" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3.5 7.27783L12 2.55566L20.5 7.27783V16.7223C20.5 17.048 20.3707 17.3604 20.1402 17.5917C19.9098 17.8231 19.5978 17.9529 19.2727 17.9529H4.72727C4.40219 17.9529 4.0902 17.8231 3.85977 17.5917C3.62935 17.3604 3.5 17.048 3.5 16.7223V7.27783Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 12V17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 12V17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Products
                </div>
              </Link>
            </div>
          </nav>

          {/* Main Content Area */}
          <main style={{ flex: 1, overflow: "auto" }}>
            <Outlet />
          </main>
        </div>
      </PolarisAppProvider>
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
