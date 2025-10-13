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
  Pagination,
  Modal,
  FormLayout,
  Checkbox,
  Badge,
  Banner,
  Spinner,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import prisma, {
  syncProduct,
  syncProductVariant,
  updateVariantSerialRequirement,
  updateProductSerialRequirement,
  getUnassignedSerials,
  assignSerialsToVariant,
  releaseSerialsFromVariant
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

        // Get serial information for this variant
        const serialCount = await prisma.serial.count({
          where: { variantId: dbVariant.id },
        });

        const assignedSerial = await prisma.serial.findFirst({
          where: { 
            variantId: dbVariant.id,
            status: { in: ["RESERVED", "SOLD"] }
          },
          select: { 
            serialNumber: true,
            status: true 
          }
        });

        variants.push({
          ...dbVariant,
          _count: { serials: serialCount },
          assignedSerial
        });
      }

      dbProducts.push({
        ...dbProduct,
        variants,
      });
    }

    // Get unassigned serials for the assignment modal
    const unassignedSerials = await getUnassignedSerials(session.shop);

    return { products: dbProducts, unassignedSerials };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { products: [], unassignedSerials: [] };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "toggleVariantSerial") {
      const variantId = formData.get("variantId") as string;
      const productId = formData.get("productId") as string;
      const requireSerial = formData.get("requireSerial") === "true";

      if (!requireSerial) {
        // When turning OFF, release any assigned serials for this variant
        const assignedSerials = await prisma.serial.findMany({
          where: { variantId },
          select: { id: true }
        });
        
        if (assignedSerials.length > 0) {
          await releaseSerialsFromVariant({
            serialIds: assignedSerials.map(s => s.id)
          });
        }
      }

      await updateVariantSerialRequirement({
        id: variantId,
        requireSerial,
      });

      // Update product requirement based on whether any variants require serials
      const variantsRequiringSerial = await prisma.productVariant.count({
        where: { 
          productId,
          requireSerial: true 
        }
      });

      await updateProductSerialRequirement({
        id: productId,
        requireSerial: variantsRequiringSerial > 0
      });

      return { success: true };
    }

    if (intent === "assignAndEnable") {
      const serialIds = JSON.parse(formData.get("serialIds") as string);
      const variantId = formData.get("variantId") as string;
      const productId = formData.get("productId") as string;

      if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
        return { success: false, message: "No serial numbers selected" };
      }

      // First assign the serials
      await assignSerialsToVariant({
        serialIds,
        productId,
        variantId,
      });

      // Then enable the requirement
      await updateVariantSerialRequirement({
        id: variantId,
        requireSerial: true,
      });

      // Update product requirement since at least one variant now requires serials
      await updateProductSerialRequirement({
        id: productId,
        requireSerial: true
      });

      return { success: true, message: `Successfully assigned ${serialIds.length} serial numbers and enabled requirement` };
    }

    if (intent === "enableOnly") {
      const variantId = formData.get("variantId") as string;
      const productId = formData.get("productId") as string;

      // Enable the requirement without assigning serials
      await updateVariantSerialRequirement({
        id: variantId,
        requireSerial: true,
      });

      // Update product requirement since at least one variant now requires serials
      await updateProductSerialRequirement({
        id: productId,
        requireSerial: true
      });

      return { success: true, message: "Successfully enabled serial requirement" };
    }

    return { success: false, message: "Unknown action" };
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, message: "Action failed" };
  }
};

export default function Products() {
  const { products, unassignedSerials } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchValue, setSearchValue] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState('All');
  const [assignmentModalActive, setAssignmentModalActive] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<{id: string, productId: string, title: string, productTitle: string} | null>(null);
  const [selectedSerial, setSelectedSerial] = useState<string>('');

  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleProductTypeFilterChange = useCallback((value: string) => {
    setProductTypeFilter(value);
    
    // If changing product type, check if current vendor is still valid
    if (value !== 'All') {
      const productsOfType = products.filter(p => p.productType === value);
      const availableVendors = Array.from(new Set(productsOfType.map(p => p.vendor).filter(Boolean)));
      
      if (vendorFilter !== 'All' && !availableVendors.includes(vendorFilter)) {
        setVendorFilter('All'); // Reset vendor if it's not available for this product type
      }
    }
  }, [products, vendorFilter]);

  const handleVendorFilterChange = useCallback((value: string) => {
    setVendorFilter(value);
    
    // If changing vendor, check if current product type is still valid
    if (value !== 'All') {
      const productsOfVendor = products.filter(p => p.vendor === value);
      const availableTypes = Array.from(new Set(productsOfVendor.map(p => p.productType).filter(Boolean)));
      
      if (productTypeFilter !== 'All' && !availableTypes.includes(productTypeFilter)) {
        setProductTypeFilter('All'); // Reset product type if it's not available for this vendor
      }
    }
  }, [products, productTypeFilter]);

  const handleToggleSerial = useCallback((variant: any, product: any, currentValue: boolean) => {
    if (!currentValue) {
      // Turning ON - show assignment modal
      setSelectedVariant({
        id: variant.id,
        productId: product.id,
        title: variant.title || 'Default Variant',
        productTitle: product.title
      });
      setSelectedSerial('');
      setAssignmentModalActive(true);
    } else {
      // Turning OFF - just toggle without modal
      fetcher.submit(
        {
          intent: 'toggleVariantSerial',
          variantId: variant.id,
          productId: product.id,
          requireSerial: 'false',
        },
        { method: 'post' }
      );
    }
  }, [fetcher]);

  const handleAssignSerials = useCallback((variant: any, product: any) => {
    setSelectedVariant({
      id: variant.id,
      productId: product.id,
      title: variant.title || 'Default Variant',
      productTitle: product.title
    });
    setSelectedSerial('');
    setAssignmentModalActive(true);
  }, []);

  const handleCloseAssignmentModal = useCallback(() => {
    setAssignmentModalActive(false);
    setSelectedVariant(null);
    setSelectedSerial('');
  }, []);

  const handleSerialSelection = useCallback((serialId: string) => {
    setSelectedSerial(serialId);
  }, []);


  const handleSubmitAssignment = useCallback(() => {
    if (!selectedVariant || !selectedSerial) return;

    // Create a single form submission that handles both actions
    const formData = new FormData();
    formData.append('intent', 'assignAndEnable');
    formData.append('serialIds', JSON.stringify([selectedSerial]));
    formData.append('variantId', selectedVariant.id);
    formData.append('productId', selectedVariant.productId);

    fetcher.submit(formData, { method: 'post' });

    handleCloseAssignmentModal();
  }, [fetcher, selectedVariant, selectedSerial, handleCloseAssignmentModal]);

  // Generate dynamic filter options based on actual data and current filters
  const getAvailableProductTypes = () => {
    let filteredForTypes = products;
    
    // If vendor is selected, only show product types available for that vendor
    if (vendorFilter !== 'All') {
      filteredForTypes = products.filter(p => p.vendor === vendorFilter);
    }
    
    const types = Array.from(new Set(filteredForTypes.map(p => p.productType).filter(Boolean))).sort();
    
    return [
      { label: `All Product Types${vendorFilter !== 'All' ? ` (${types.length})` : ` (${Array.from(new Set(products.map(p => p.productType).filter(Boolean))).length})`}`, value: 'All' },
      ...types.map(type => {
        const count = filteredForTypes.filter(p => p.productType === type).length;
        return { label: `${type} (${count})`, value: type };
      })
    ];
  };

  const getAvailableVendors = () => {
    let filteredForVendors = products;
    
    // If product type is selected, only show vendors available for that type
    if (productTypeFilter !== 'All') {
      filteredForVendors = products.filter(p => p.productType === productTypeFilter);
    }
    
    const vendors = Array.from(new Set(filteredForVendors.map(p => p.vendor).filter(Boolean))).sort();
    
    return [
      { label: `All Vendors${productTypeFilter !== 'All' ? ` (${vendors.length})` : ` (${Array.from(new Set(products.map(p => p.vendor).filter(Boolean))).length})`}`, value: 'All' },
      ...vendors.map(vendor => {
        const count = filteredForVendors.filter(p => p.vendor === vendor).length;
        return { label: `${vendor} (${count})`, value: vendor };
      })
    ];
  };

  const productTypeOptions = getAvailableProductTypes();
  const vendorOptions = getAvailableVendors();

  // Filter products based on current filter values
  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchValue || 
      product.title.toLowerCase().includes(searchValue.toLowerCase()) ||
      product.variants.some(v => 
        (v.title && v.title.toLowerCase().includes(searchValue.toLowerCase())) ||
        (v.sku && v.sku.toLowerCase().includes(searchValue.toLowerCase()))
      );
    
    const matchesProductType = productTypeFilter === 'All' || product.productType === productTypeFilter;
    const matchesVendor = vendorFilter === 'All' || product.vendor === vendorFilter;
    
    return matchesSearch && matchesProductType && matchesVendor;
  });

  // Toggle component using CSS
  const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onChange}
      onKeyDown={disabled ? undefined : (e) => {
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s ease',
        opacity: disabled ? 0.6 : 1,
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
      {disabled && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Spinner size="small" />
        </div>
      )}
    </div>
  );

  // Generate rows from filtered product data
  const rows = filteredProducts.flatMap((product) =>
    product.variants.map((variant) => {
      const variantWithSerial = variant as typeof variant & { 
        _count?: { serials: number };
        assignedSerial?: { serialNumber: string; status: string } | null;
      };
      
      return [
        product.title,
        variant.title || 'Default Variant',
        variant.sku || '-',
        variantWithSerial.assignedSerial?.serialNumber || '-',
        variantWithSerial.assignedSerial ? (
          <Badge 
            key={`status-${variant.id}`}
            tone={variantWithSerial.assignedSerial.status === 'RESERVED' ? 'warning' : 'info'}
          >
            {variantWithSerial.assignedSerial.status}
          </Badge>
        ) : '-',
        <Toggle
          key={`toggle-${variant.id}`}
          checked={variant.requireSerial}
          onChange={() => handleToggleSerial(variant, product, variant.requireSerial)}
          disabled={isLoading}
        />,
        <InlineStack key={`actions-${variant.id}`} gap="200">
          {variant.requireSerial && !variantWithSerial.assignedSerial && (
            <Button 
              size="micro" 
              variant="plain" 
              onClick={() => handleAssignSerials(variant, product)}
              disabled={unassignedSerials.length === 0 || isLoading}
              loading={isLoading}
            >
              📎 Assign
            </Button>
          )}
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
      ];
    })
  );

  // Loading skeleton component
  const LoadingSkeleton = () => (
    <Page title="Products">
      <BlockStack gap="400">
        <SkeletonBodyText />
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" align="space-between">
              <SkeletonDisplayText size="medium" />
              <InlineStack gap="200">
                <SkeletonBodyText lines={1} />
                <SkeletonBodyText lines={1} />
              </InlineStack>
            </InlineStack>
            <SkeletonBodyText lines={5} />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );

  return (
    <Page title="Products">
      <BlockStack gap="400">
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd" tone="subdued">
            Configure which product variants require serial numbers during POS checkout
          </Text>
          
          {/* Active Filters Display */}
          {(searchValue || productTypeFilter !== 'All' || vendorFilter !== 'All') && (
            <Card>
              <InlineStack gap="200" align="space-between">
                <InlineStack gap="200" wrap={false}>
                  <Text as="span" variant="bodyMd" tone="subdued">Active filters:</Text>
                  {searchValue && (
                    <Badge tone="info">
                      Search: "{searchValue}"
                    </Badge>
                  )}
                  {productTypeFilter !== 'All' && (
                    <Badge tone="info">
                      Type: {productTypeFilter}
                    </Badge>
                  )}
                  {vendorFilter !== 'All' && (
                    <Badge tone="info">
                      Vendor: {vendorFilter}
                    </Badge>
                  )}
                </InlineStack>
                <Button 
                  size="micro" 
                  variant="plain" 
                  onClick={() => {
                    setSearchValue('');
                    setProductTypeFilter('All');
                    setVendorFilter('All');
                  }}
                >
                  Clear all filters
                </Button>
              </InlineStack>
            </Card>
          )}
        </BlockStack>

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

            {/* Data Table or Empty State */}
            {products.length === 0 ? (
              <EmptyState
                heading="No products found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Your products will appear here once they're synced from your Shopify store. 
                  If you have products in your store, try refreshing this page.
                </p>
              </EmptyState>
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                heading="No products match your filters"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Try adjusting your search or filter criteria to see more results.
                </p>
                <InlineStack gap="300" align="center">
                  <Button onClick={() => setSearchValue('')}>Clear Search</Button>
                  <Button onClick={() => {
                    setProductTypeFilter('All');
                    setVendorFilter('All');
                  }}>Clear Filters</Button>
                </InlineStack>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={[
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                ]}
                headings={[
                  'Product Name',
                  'Variant Name',
                  'SKU',
                  'Assigned Serial',
                  'Serial Status',
                  'Require Serial',
                  'Actions',
                ]}
                rows={rows}
              />
            )}

            {/* Pagination */}
            <InlineStack align="space-between">
              <Text as="p" variant="bodyMd" tone="subdued">
                Showing {rows.length} of {products.flatMap(p => p.variants).length} total variants
                {(searchValue || productTypeFilter !== 'All' || vendorFilter !== 'All') && 
                  ` (filtered from ${products.length} products)`
                }
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

      {/* Serial Assignment Modal */}
      <Modal
        open={assignmentModalActive}
        onClose={handleCloseAssignmentModal}
        title={`Enable Serial Requirement for ${selectedVariant?.productTitle} - ${selectedVariant?.title}`}
        primaryAction={{
          content: selectedSerial ? 'Select & Assign' : 'Select & Assign',
          onAction: handleSubmitAssignment,
          disabled: !selectedSerial || isLoading,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleCloseAssignmentModal,
          },
          {
            content: 'Enable Only',
            onAction: () => {
              if (!selectedVariant) return;
              
              fetcher.submit(
                {
                  intent: 'enableOnly',
                  variantId: selectedVariant.id,
                  productId: selectedVariant.productId,
                },
                { method: 'post' }
              );
              
              handleCloseAssignmentModal();
            },
            disabled: isLoading,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd" tone="subdued">
              You must assign one serial number to enable serial requirement for this variant. Each variant can only have one serial number assigned.
            </Text>

            {unassignedSerials.length === 0 ? (
              <Banner status="warning">
                <Text as="p" variant="bodyMd">
                  No unassigned serial numbers available. You need to import serial numbers first using the bulk import feature before enabling serial requirement.
                </Text>
              </Banner>
            ) : (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Available Unassigned Serial Numbers ({unassignedSerials.length})
                  </Text>

                  <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '6px', padding: '12px' }}>
                    <BlockStack gap="200">
                      {unassignedSerials.map((serial) => (
                        <label key={serial.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="selectedSerial"
                            value={serial.id}
                            checked={selectedSerial === serial.id}
                            onChange={() => handleSerialSelection(serial.id)}
                            style={{ margin: 0 }}
                          />
                          <Text as="span" variant="bodyMd">{serial.serialNumber}</Text>
                        </label>
                      ))}
                    </BlockStack>
                  </div>

                  {selectedSerial && (
                    <Text as="p" variant="bodySm" tone="success">
                      Serial selected for assignment
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

            <Text as="p" variant="bodySm" tone="subdued">
              Note: Each variant can only have one serial number. Once assigned, this serial will be exclusively linked to this product variant and marked as reserved.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
