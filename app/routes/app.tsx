import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, Link, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider, Spinner } from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Determine which tab is active based on current path
  const isDashboardActive = location.pathname === "/app";
  const isProductsActive = location.pathname === "/app/products" || location.pathname.startsWith("/app/products/");
  const isAssignmentActive = location.pathname === "/app/assignment" || location.pathname.startsWith("/app/assignment/");

  // Check if navigation is in progress
  const isNavigating = navigation.state === "loading";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={{}}>
        <div style={{ display: "flex", height: "100vh", position: "relative" }}>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              position: "fixed",
              top: "1rem",
              left: "1rem",
              zIndex: 1001,
              display: "none",
              padding: "0.5rem",
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
            }}
            className="mobile-menu-btn"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Mobile Overlay */}
          {mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setMobileMenuOpen(false);
                }
              }}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                zIndex: 999,
                display: "none",
              }}
              className="mobile-overlay"
            />
          )}

          {/* Sidebar Navigation */}
          <nav
            style={{
              width: "240px",
              backgroundColor: "#f9fafb",
              borderRight: "1px solid #e5e7eb",
              padding: "1.5rem 0",
              overflowY: "auto",
            }}
            className="sidebar-nav"
            data-mobile-open={mobileMenuOpen}
          >


            {/* Navigation Items */}
            <div style={{ padding: "0 1rem" }}>
              <Link to="/app" prefetch="intent" style={{ textDecoration: "none" }} onClick={() => setMobileMenuOpen(false)}>
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

              <Link to="/app/products" prefetch="intent" style={{ textDecoration: "none" }} onClick={() => setMobileMenuOpen(false)}>
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

              <Link to="/app/assignment" prefetch="intent" style={{ textDecoration: "none" }} onClick={() => setMobileMenuOpen(false)}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: isAssignmentActive ? "#dcfce7" : "transparent",
                  color: isAssignmentActive ? "#00A047" : "#6b7280",
                  fontWeight: isAssignmentActive ? "500" : "400",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2H8C7.44772 2 7 2.44772 7 3V21C7 21.5523 7.44772 22 8 22H16C16.5523 22 17 21.5523 17 21V3C17 2.44772 16.5523 2 16 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 7H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 11H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 15H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Assignment
                </div>
              </Link>
            </div>
          </nav>

          {/* Main Content Area */}
          <main style={{ flex: 1, overflow: "auto", marginLeft: 0, position: "relative" }} className="main-content">
            {isNavigating && (
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}>
                <Spinner size="large" />
              </div>
            )}
            <Outlet />
          </main>
        </div>

        {/* Mobile Responsive Styles */}
        <style>{`
          /* Desktop styles */
          @media (min-width: 769px) {
            .sidebar-nav {
              position: static !important;
              width: 240px !important;
              min-width: 240px !important;
            }
            .main-content {
              margin-left: 0 !important;
            }
            .mobile-menu-btn {
              display: none !important;
            }
            .mobile-overlay {
              display: none !important;
            }
          }

          /* Mobile styles */
          @media (max-width: 768px) {
            .sidebar-nav {
              position: fixed !important;
              top: 0 !important;
              bottom: 0 !important;
              left: -240px !important;
              z-index: 1000 !important;
              transition: left 0.3s ease !important;
            }
            .sidebar-nav[data-mobile-open="true"] {
              left: 0 !important;
            }
            .mobile-menu-btn {
              display: block !important;
            }
            .main-content {
              margin-left: 0 !important;
            }
          }
        `}</style>
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
