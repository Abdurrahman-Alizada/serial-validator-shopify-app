import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  DataTable,
  Pagination
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import prisma, {
  syncProduct,
  syncProductVariant,
  updateProductSerialRequirement,
  updateVariantSerialRequirement
} from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Fetch products from Shopify
    const response = await admin.graphql(
      `#graphql
        query getProducts($first: Int!) {
          products(first: $first) {
            edges {
              node {
                id
                title
                handle
                productType
                vendor
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          first: 50,
        },
      }
    );

    const data = await response.json();
    const shopifyProducts = data.data?.products?.edges || [];

    // Sync products to database
    const dbProducts = [];
    for (const edge of shopifyProducts) {
      const product = edge.node;
      const shopifyId = product.id.replace('gid://shopify/Product/', '');

      const dbProduct = await syncProduct({
        shopifyId,
        title: product.title,
        handle: product.handle,
        productType: product.productType,
        vendor: product.vendor,
        shop: session.shop,
      });

      // Sync variants
      const variants = [];
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantShopifyId = variant.id.replace('gid://shopify/ProductVariant/', '');

        const dbVariant = await syncProductVariant({
          shopifyId: variantShopifyId,
          productId: dbProduct.id,
          title: variant.title,
          sku: variant.sku,
          price: variant.price,
          inventoryQty: variant.inventoryQuantity,
        });

        // Get serial count for this variant
        const serialCount = await prisma.serial.count({
          where: { variantId: dbVariant.id },
        });

        variants.push({
          ...dbVariant,
          _count: { serials: serialCount },
        });
      }

      dbProducts.push({
        ...dbProduct,
        variants,
      });
    }

    return { products: dbProducts };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { products: [] };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "toggleProductSerial") {
      const productId = formData.get("productId") as string;
      const requireSerial = formData.get("requireSerial") === "true";

      await updateProductSerialRequirement({
        id: productId,
        requireSerial,
      });

      return { success: true };
    }

    if (intent === "toggleVariantSerial") {
      const variantId = formData.get("variantId") as string;
      const requireSerial = formData.get("requireSerial") === "true";

      await updateVariantSerialRequirement({
        id: variantId,
        requireSerial,
      });

      return { success: true };
    }

    // TODO: Add edit/delete functionality

    return { success: false, message: "Unknown action" };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, message: "Action failed" };
  }
};

export default function Products() {
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchValue, setSearchValue] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState('All');

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleProductTypeFilterChange = useCallback((value: string) => {
    setProductTypeFilter(value);
  }, []);

  const handleVendorFilterChange = useCallback((value: string) => {
    setVendorFilter(value);
  }, []);

  const productTypeOptions = [
    { label: 'All', value: 'All' },
    { label: 'Electronics', value: 'Electronics' },
    { label: 'Clothing', value: 'Clothing' },
    { label: 'Accessories', value: 'Accessories' },
    { label: 'Home & Garden', value: 'Home & Garden' },
  ];

  const vendorOptions = [
    { label: 'All', value: 'All' },
    { label: 'EcoTech', value: 'EcoTech' },
    { label: 'OrganicWear', value: 'OrganicWear' },
    { label: 'AudioPro', value: 'AudioPro' },
    { label: 'LeatherCraft', value: 'LeatherCraft' },
  ];

  // Toggle component using CSS
  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange();
        }
      }}
      style={{
        width: '48px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: checked ? '#00A047' : '#E1E3E5',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: 'white',
          position: 'absolute',
          top: '2px',
          left: checked ? '26px' : '2px',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      />
    </div>
  );

  // Generate rows from real product data
  const rows = products.flatMap((product) =>
    product.variants.map((variant) => [
      product.title,
      variant.title || 'Default Title',
      variant.sku || '-',
      ((variant as { _count?: { serials: number } })._count?.serials?.toString() || '0'),
      <Toggle
        key={`toggle-${variant.id}`}
        checked={variant.requireSerial}
        onChange={() => {
          fetcher.submit(
            {
              intent: 'toggleVariantSerial',
              variantId: variant.id,
              requireSerial: (!variant.requireSerial).toString(),
            },
            { method: 'post' }
          );
        }}
      />,
      <InlineStack key={`actions-${variant.id}`} gap="200">
        <Button size="micro" variant="plain" onClick={() => console.log('Edit', variant.id)}>
          ✏️
        </Button>
        <Button
          size="micro"
          variant="plain"
          tone="critical"
          onClick={() => console.log('Delete', variant.id)}
        >
          🗑️
        </Button>
      </InlineStack>
    ])
  );

  return (
    <Page title="Products">
      <BlockStack gap="400">
        <Text as="p" variant="bodyMd" tone="subdued">
          Manage serial numbers for products and variants sold via POS
        </Text>

        <Card>
          <BlockStack gap="400">
            {/* Search and Filter Controls */}
            <InlineStack gap="400" align="space-between">
              <div style={{ flex: 1, maxWidth: '500px' }}>
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder="Search products"
                  prefix="🔍"
                  autoComplete="off"
                />
              </div>
              <InlineStack gap="200" align="end">
                <div style={{ minWidth: '140px' }}>
                  <Select
                    label="Product type"
                    options={productTypeOptions}
                    value={productTypeFilter}
                    onChange={handleProductTypeFilterChange}
                  />
                </div>
                <div style={{ minWidth: '140px' }}>
                  <Select
                    label="Vendor"
                    options={vendorOptions}
                    value={vendorFilter}
                    onChange={handleVendorFilterChange}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Text as="p" variant="bodyMd" tone="subdued">Sort</Text>
                  <Button>Sort</Button>
                </div>
              </InlineStack>
            </InlineStack>

            {/* Data Table */}
            <DataTable
              columnContentTypes={[
                'text',
                'text',
                'text',
                'numeric',
                'text',
                'text',
              ]}
              headings={[
                'Product Name',
                'Variant',
                'SKU',
                'Serial Numbers',
                'Require Serial',
                'Actions',
              ]}
              rows={rows}
            />

            {/* Pagination */}
            <InlineStack align="space-between">
              <Text as="p" variant="bodyMd" tone="subdued">
                Showing 1 to 7 of 7 results
              </Text>
              <Pagination
                hasPrevious={false}
                onPrevious={() => {}}
                hasNext={false}
                onNext={() => {}}
              />
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
