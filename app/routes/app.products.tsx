import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Products() {
  return (
    <s-page heading="Products">
      <s-button slot="primary-action">Add Product</s-button>
      
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Product Management</s-heading>
          <s-text color="subdued">
            Product list will appear here soon
          </s-text>
          <s-text>
            This section will contain your complete product catalog, including inventory levels, 
            pricing information, and product variants. You'll be able to manage your entire 
            product lineup from this centralized location.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Product Actions">
        <s-stack direction="block" gap="base">
          <s-button>Create New Product</s-button>
          <s-button variant="secondary">Import Products</s-button>
          <s-button variant="secondary">Export Catalog</s-button>
          <s-button variant="secondary">Bulk Edit</s-button>
        </s-stack>
      </s-section>

      <s-section heading="Product Overview">
        <s-stack direction="block" gap="base">
          <s-text color="subdued">
            Here you'll find a comprehensive overview of your product performance, 
            including bestsellers, low stock alerts, and product analytics.
          </s-text>
          
          <s-stack direction="block" gap="base">
            <s-text>📦 Total Products: 0</s-text>
            <s-text>⚠️ Low Stock Items: 0</s-text>
            <s-text>🔥 Top Selling: Not available yet</s-text>
            <s-text>📊 Conversion Rate: 0%</s-text>
          </s-stack>

          <s-banner>
            <s-text>
              Start by adding your first product to see detailed analytics and manage your inventory effectively.
            </s-text>
          </s-banner>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};