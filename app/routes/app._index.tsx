import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Dashboard() {
  return (
    <s-page heading="Dashboard">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Welcome to your Shopify Dashboard</s-heading>
          <s-text color="subdued">
            This is your main dashboard where you can view an overview of your store's performance, 
            track key metrics, and access important information at a glance.
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Quick Stats">
        <s-stack direction="block" gap="base">
          <s-text>• Total Orders: 156</s-text>
          <s-text>• Revenue: $12,450</s-text>
          <s-text>• Active Products: 24</s-text>
          <s-text>• Customers: 89</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Recent Activity">
        <s-stack direction="block" gap="base">
          <s-text color="subdued">
            Track your recent store activities and updates here. This section will show 
            the latest orders, product updates, and customer interactions.
          </s-text>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary">View All Orders</s-button>
            <s-button>Manage Products</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};