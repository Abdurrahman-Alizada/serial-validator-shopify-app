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
  Spinner,
  EmptyState,
  SkeletonBodyText,
  SkeletonDisplayText
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import prisma, {
  syncProduct,
  syncProductVariant,
  updateVariantSerialRequirement,
  updateProductSerialRequirement,
  getAvailableSerialsForVariant,
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

        // Get serial counts for this variant
        const availableCount = await prisma.serial.count({
          where: {
            variantId: dbVariant.id,
            status: 'AVAILABLE'
          },
        });

        const assignedCount = await prisma.serial.count({
          where: {
            variantId: dbVariant.id,
            status: {
              in: ['ASSIGNED', 'RESERVED', 'SOLD', 'RETURNED']
            }
          },
        });

        // Get all serial numbers for display (all statuses)
        const assignedSerials = await prisma.serial.findMany({
          where: {
            variantId: dbVariant.id,
            status: {
              in: ['ASSIGNED', 'RESERVED', 'SOLD', 'RETURNED']
            }
          },
          select: {
            serialNumber: true,
            status: true
          },
          orderBy: [
            { status: 'asc' },
            { serialNumber: 'asc' }
          ],
          take: 3 // Limit to first 3 for display
        });

        variants.push({
          ...dbVariant,
          availableCount,
          assignedCount,
          assignedSerials
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

    if (intent === "assignSerials") {
      const serialIds = JSON.parse(formData.get("serialIds") as string);
      const variantId = formData.get("variantId") as string;
      const productId = formData.get("productId") as string;

      if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
        return { success: false, message: "No serial numbers selected" };
      }

      // Assign the serials (change status from AVAILABLE to ASSIGNED)
      await assignSerialsToVariant({
        serialIds,
        productId,
        variantId,
      });

      return { success: true, message: `Successfully assigned ${serialIds.length} serial number${serialIds.length > 1 ? 's' : ''}` };
    }

    if (intent === "assignAndEnable") {
      const serialIds = JSON.parse(formData.get("serialIds") as string);
      const variantId = formData.get("variantId") as string;
      const productId = formData.get("productId") as string;

      if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
        return { success: false, message: "No serial numbers selected" };
      }

      // First assign the serials (change status from AVAILABLE to ASSIGNED)
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

      return { success: true, message: `Successfully assigned ${serialIds.length} serial number${serialIds.length > 1 ? 's' : ''} and enabled requirement` };
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
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchValue, setSearchValue] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState('All');
  const [assignmentModalActive, setAssignmentModalActive] = useState(false);
  const [serialDetailsModalActive, setSerialDetailsModalActive] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<{id: string, productId: string, title: string, productTitle: string, inventoryQty: number, assignedCount: number} | null>(null);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);
  const [availableSerials, setAvailableSerials] = useState<Array<{id: string, serialNumber: string}>>([]);
  const [viewingSerials, setViewingSerials] = useState<Array<{id: string, serialNumber: string, status: string, orderId?: string | null}>>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState('25');
  const [togglingVariantId, setTogglingVariantId] = useState<string | null>(null);

  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  // Clear toggling state when fetcher completes
  useEffect(() => {
    if (fetcher.state === "idle" && togglingVariantId) {
      setTogglingVariantId(null);
    }
  }, [fetcher.state, togglingVariantId]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const handleProductTypeFilterChange = useCallback((value: string) => {
    setProductTypeFilter(value);
    setCurrentPage(1); // Reset to first page when filtering

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
    setCurrentPage(1); // Reset to first page when filtering

    // If changing vendor, check if current product type is still valid
    if (value !== 'All') {
      const productsOfVendor = products.filter(p => p.vendor === value);
      const availableTypes = Array.from(new Set(productsOfVendor.map(p => p.productType).filter(Boolean)));

      if (productTypeFilter !== 'All' && !availableTypes.includes(productTypeFilter)) {
        setProductTypeFilter('All'); // Reset product type if it's not available for this vendor
      }
    }
  }, [products, productTypeFilter]);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage(prev => prev + 1);
  }, []);

  const handleItemsPerPageChange = useCallback((value: string) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  const handleToggleSerial = useCallback(async (variant: any, product: any, currentValue: boolean) => {
    if (!currentValue) {
      // Turning ON - show assignment modal with multiple selection
      const variantWithCounts = variant as typeof variant & {
        availableCount?: number;
        assignedCount?: number;
      };

      setSelectedVariant({
        id: variant.id,
        productId: product.id,
        title: variant.title || 'Default Variant',
        productTitle: product.title,
        inventoryQty: variant.inventoryQty || 0,
        assignedCount: variantWithCounts.assignedCount || 0
      });
      setSelectedSerialIds([]);
      setAssignmentModalActive(true);

      // Fetch available serials for this variant
      setLoadingSerials(true);
      try {
        const response = await fetch(`/api/available-serials?productId=${product.id}&variantId=${variant.id}`);
        const data = await response.json();
        if (data.success && data.serials) {
          setAvailableSerials(data.serials);
        }
      } catch (error) {
        console.error('Error fetching serials:', error);
        setAvailableSerials([]);
      } finally {
        setLoadingSerials(false);
      }
    } else {
      // Turning OFF - just toggle without modal
      setTogglingVariantId(variant.id);
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

  const handleAssignSerials = useCallback(async (variant: any, product: any) => {
    const variantWithCounts = variant as typeof variant & {
      availableCount?: number;
      assignedCount?: number;
    };

    setSelectedVariant({
      id: variant.id,
      productId: product.id,
      title: variant.title || 'Default Variant',
      productTitle: product.title,
      inventoryQty: variant.inventoryQty || 0,
      assignedCount: variantWithCounts.assignedCount || 0
    });
    setSelectedSerialIds([]);
    setAssignmentModalActive(true);

    // Fetch available serials for this variant
    setLoadingSerials(true);
    try {
      const response = await fetch(`/api/available-serials?productId=${product.id}&variantId=${variant.id}`);
      const data = await response.json();
      if (data.success && data.serials) {
        setAvailableSerials(data.serials);
      }
    } catch (error) {
      console.error('Error fetching serials:', error);
      setAvailableSerials([]);
    } finally {
      setLoadingSerials(false);
    }
  }, []);

  const handleCloseAssignmentModal = useCallback(() => {
    setAssignmentModalActive(false);
    setSelectedVariant(null);
    setSelectedSerialIds([]);
    setAvailableSerials([]);
  }, []);

  const handleViewSerials = useCallback(async (variant: any, product: any) => {
    const variantWithCounts = variant as typeof variant & {
      assignedSerials?: Array<{ serialNumber: string; status: string }>;
    };

    setSelectedVariant({
      id: variant.id,
      productId: product.id,
      title: variant.title || 'Default Variant',
      productTitle: product.title,
      inventoryQty: variant.inventoryQty || 0,
      assignedCount: variantWithCounts.assignedSerials?.length || 0
    });

    // Fetch all serials for this variant (all statuses)
    setLoadingSerials(true);
    try {
      const response = await fetch(`/api/variant-serials?productId=${product.id}&variantId=${variant.id}`);
      const data = await response.json();
      if (data.success && data.serials) {
        setViewingSerials(data.serials);
      }
    } catch (error) {
      console.error('Error fetching serials:', error);
      setViewingSerials([]);
    } finally {
      setLoadingSerials(false);
    }

    setSerialDetailsModalActive(true);
  }, []);

  const handleCloseSerialDetailsModal = useCallback(() => {
    setSerialDetailsModalActive(false);
    setSelectedVariant(null);
    setViewingSerials([]);
  }, []);

  const handleToggleSerialSelection = useCallback((serialId: string) => {
    setSelectedSerialIds(prev => {
      if (prev.includes(serialId)) {
        // Deselecting - always allow
        return prev.filter(id => id !== serialId);
      } else {
        // Selecting - check inventory limit
        if (!selectedVariant) return prev;

        const currentAssigned = selectedVariant.assignedCount;
        const newTotal = currentAssigned + prev.length + 1;
        const inventoryLimit = selectedVariant.inventoryQty;

        // Only allow if we haven't exceeded inventory
        if (newTotal <= inventoryLimit) {
          return [...prev, serialId];
        }
        return prev;
      }
    });
  }, [selectedVariant]);

  const handleSubmitAssignment = useCallback(() => {
    if (!selectedVariant) return;

    // Check if assignment would exceed inventory
    if (selectedSerialIds.length > 0) {
      const totalAssigned = selectedVariant.assignedCount + selectedSerialIds.length;
      if (totalAssigned > selectedVariant.inventoryQty) {
        // This shouldn't happen due to UI restrictions, but double-check
        alert(`Cannot assign ${selectedSerialIds.length} serials. Total would be ${totalAssigned} but inventory is only ${selectedVariant.inventoryQty}.`);
        return;
      }
    }

    const formData = new FormData();

    if (selectedSerialIds.length > 0) {
      // Assign serials AND enable requirement
      formData.append('intent', 'assignAndEnable');
      formData.append('serialIds', JSON.stringify(selectedSerialIds));
      formData.append('variantId', selectedVariant.id);
      formData.append('productId', selectedVariant.productId);
    } else {
      // Just enable requirement without assigning
      formData.append('intent', 'enableOnly');
      formData.append('variantId', selectedVariant.id);
      formData.append('productId', selectedVariant.productId);
    }

    // Track which variant is being toggled
    setTogglingVariantId(selectedVariant.id);

    fetcher.submit(formData, { method: 'post' });

    handleCloseAssignmentModal();
  }, [fetcher, selectedVariant, selectedSerialIds, handleCloseAssignmentModal]);

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

  // Calculate pagination for product variants (flatten products to variants first)
  const allVariants = filteredProducts.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant }))
  );

  const itemsPerPageNum = parseInt(itemsPerPage, 10);
  const totalItems = allVariants.length;
  const totalPages = Math.ceil(totalItems / itemsPerPageNum);
  const startIndex = (currentPage - 1) * itemsPerPageNum;
  const endIndex = startIndex + itemsPerPageNum;
  const paginatedVariants = allVariants.slice(startIndex, endIndex);

  // Generate rows from paginated variant data
  const rows = paginatedVariants.map(({ product, variant }) => {
    const variantWithCounts = variant as typeof variant & {
      availableCount?: number;
      assignedCount?: number;
      assignedSerials?: Array<{ serialNumber: string; status: string }>;
    };

    const availableCount = variantWithCounts.availableCount || 0;
    const assignedCount = variantWithCounts.assignedCount || 0;
    const assignedSerials = variantWithCounts.assignedSerials || [];

    const inventoryQty = variant.inventoryQty || 0;
    const inventoryStatus =
      assignedCount > inventoryQty ? 'critical' :
      assignedCount === inventoryQty ? 'success' :
      'subdued';

    return [
      product.title,
      variant.title || 'Default Variant',
      variant.sku || '-',
      <Text key={`inventory-${variant.id}`} as="span">{inventoryQty}</Text>,
      <Text key={`assigned-${variant.id}`} as="span" tone={inventoryStatus}>{assignedCount}</Text>,
      assignedSerials.length > 0 ? (
        <BlockStack key={`serials-${variant.id}`} gap="100">
          <InlineStack gap="100" wrap>
            {assignedSerials.slice(0, 3).map((serial, idx) => (
              <Badge
                key={idx}
                tone={
                  serial.status === 'AVAILABLE' ? 'info' :
                  serial.status === 'ASSIGNED' ? 'success' :
                  serial.status === 'RESERVED' ? 'warning' :
                  serial.status === 'SOLD' ? undefined :
                  serial.status === 'RETURNED' ? 'critical' : 'info'
                }
              >
                {serial.serialNumber}
              </Badge>
            ))}
            {assignedCount > 3 && (
              <Badge tone="info">
                +{assignedCount - 3} more
              </Badge>
            )}
          </InlineStack>
        </BlockStack>
      ) : (
        <Text key={`no-serials-${variant.id}`} as="span" tone="subdued">-</Text>
      ),
      <Toggle
        key={`toggle-${variant.id}`}
        checked={variant.requireSerial}
        onChange={() => handleToggleSerial(variant, product, variant.requireSerial)}
        disabled={togglingVariantId === variant.id}
      />,
      <InlineStack key={`actions-${variant.id}`} gap="200">
        {assignedCount > 0 && (
          <Button
            size="micro"
            variant="plain"
            onClick={() => handleViewSerials(variant, product)}
            accessibilityLabel="View serial details"
          >
            🔍
          </Button>
        )}
        {(availableCount > 0 || (variant.requireSerial && assignedCount < inventoryQty)) && (
          <Button
            size="micro"
            variant="plain"
            onClick={() => handleAssignSerials(variant, product)}
            tone={assignedCount < inventoryQty ? "success" : undefined}
          >
            {assignedCount > 0 ? `+${inventoryQty - assignedCount}` : 'Assign'}
          </Button>
        )}
      </InlineStack>
    ];
  });


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
            <BlockStack gap="300">
              <div style={{ width: '100%' }}>
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder="Search products"
                  prefix="🔍"
                  autoComplete="off"
                />
              </div>
              <InlineStack gap="300" wrap>
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <Select
                    label="Product type"
                    options={productTypeOptions}
                    value={productTypeFilter}
                    onChange={handleProductTypeFilterChange}
                  />
                </div>
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <Select
                    label="Vendor"
                    options={vendorOptions}
                    value={vendorFilter}
                    onChange={handleVendorFilterChange}
                  />
                </div>
              </InlineStack>
            </BlockStack>

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
              <div style={{ overflowX: 'auto' }}>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'numeric',
                    'numeric',
                    'text',
                    'text',
                    'text',
                  ]}
                  headings={[
                    'Product Name',
                    'Variant Name',
                    'SKU',
                    'Inventory',
                    'Assigned Serials',
                    'Serial Numbers',
                    'Require Serial',
                    'Actions',
                  ]}
                  rows={rows}
                />
              </div>
            )}

            {/* Pagination */}
            <BlockStack gap="300">
              <InlineStack gap="300" align="space-between" blockAlign="center" wrap>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, totalItems)} of {totalItems} results
                  {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <div style={{ minWidth: '120px' }}>
                    <Select
                      label=""
                      labelHidden
                      options={[
                        { label: '5 per page', value: '5' },
                        { label: '10 per page', value: '10' },
                        { label: '25 per page', value: '25' },
                        { label: '50 per page', value: '50' },
                        { label: '100 per page', value: '100' },
                      ]}
                      value={itemsPerPage}
                      onChange={handleItemsPerPageChange}
                    />
                  </div>
                  <Pagination
                    hasPrevious={currentPage > 1}
                    onPrevious={handlePreviousPage}
                    hasNext={currentPage < totalPages}
                    onNext={handleNextPage}
                  />
                </InlineStack>
              </InlineStack>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Serial Assignment Modal */}
      <Modal
        open={assignmentModalActive}
        onClose={handleCloseAssignmentModal}
        title={`Enable Serial Requirement for ${selectedVariant?.productTitle} - ${selectedVariant?.title}`}
        primaryAction={{
          content: selectedSerialIds.length > 0
            ? `Assign ${selectedSerialIds.length} Serial${selectedSerialIds.length !== 1 ? 's' : ''} & Enable`
            : 'Enable Only',
          onAction: handleSubmitAssignment,
          disabled: isLoading,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleCloseAssignmentModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedVariant && (
              <InlineStack gap="400" align="space-between">
                <Text as="p" variant="bodyMd">
                  <strong>Inventory:</strong> {selectedVariant.inventoryQty}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Assigned:</strong> {selectedVariant.assignedCount}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Available:</strong> {Math.max(0, selectedVariant.inventoryQty - selectedVariant.assignedCount)}
                </Text>
              </InlineStack>
            )}

            {loadingSerials ? (
              <BlockStack gap="200">
                <SkeletonBodyText lines={3} />
              </BlockStack>
            ) : availableSerials.length === 0 ? (
              <EmptyState
                heading="No available serials"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Import serials from the Dashboard first.</p>
              </EmptyState>
            ) : (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      Available Serial Numbers ({availableSerials.length})
                    </Text>
                    {selectedSerialIds.length > 0 && (
                      <Badge tone="info">
                        {selectedSerialIds.length} selected
                      </Badge>
                    )}
                  </InlineStack>

                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '6px', padding: '12px' }}>
                    <BlockStack gap="200">
                      {availableSerials.map((serial) => {
                        const isSelected = selectedSerialIds.includes(serial.id);
                        const currentAssigned = selectedVariant?.assignedCount || 0;
                        const newTotal = currentAssigned + selectedSerialIds.length;
                        const inventoryLimit = selectedVariant?.inventoryQty || 0;
                        const canSelect = isSelected || newTotal < inventoryLimit;

                        return (
                          <label
                            key={serial.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: canSelect ? 'pointer' : 'not-allowed',
                              padding: '8px',
                              borderRadius: '4px',
                              backgroundColor: isSelected ? '#f0f8ff' : 'transparent',
                              opacity: canSelect ? 1 : 0.5
                            }}
                          >
                            <input
                              type="checkbox"
                              value={serial.id}
                              checked={isSelected}
                              onChange={() => handleToggleSerialSelection(serial.id)}
                              disabled={!canSelect}
                              style={{ margin: 0 }}
                            />
                            <Text as="span" variant="bodyMd">{serial.serialNumber}</Text>
                            {!canSelect && !isSelected && (
                              <Text as="span" variant="bodySm" tone="subdued">(Limit reached)</Text>
                            )}
                          </label>
                        );
                      })}
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Serial Details Modal */}
      <Modal
        open={serialDetailsModalActive}
        onClose={handleCloseSerialDetailsModal}
        title={`Serial Numbers - ${selectedVariant?.productTitle} - ${selectedVariant?.title}`}
        primaryAction={{
          content: 'Close',
          onAction: handleCloseSerialDetailsModal,
        }}
        secondaryActions={
          selectedVariant && viewingSerials.length < selectedVariant.inventoryQty ? [
            {
              content: `Assign ${selectedVariant.inventoryQty - viewingSerials.length} More`,
              onAction: () => {
                handleCloseSerialDetailsModal();
                // Find the variant data from products
                const product = products.find(p => p.id === selectedVariant.productId);
                const variant = product?.variants.find(v => v.id === selectedVariant.id);
                if (variant && product) {
                  handleAssignSerials(variant, product);
                }
              },
            },
          ] : undefined
        }
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedVariant && (
              <InlineStack gap="400" align="space-between">
                <Text as="p" variant="bodyMd">
                  <strong>Inventory:</strong> {selectedVariant.inventoryQty}
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Total Assigned:</strong> {viewingSerials.length}
                </Text>
                <Text as="p" variant="bodyMd" tone={
                  viewingSerials.length < selectedVariant.inventoryQty ? "critical" :
                  viewingSerials.length === selectedVariant.inventoryQty ? "success" : "warning"
                }>
                  <strong>Remaining:</strong> {Math.max(0, selectedVariant.inventoryQty - viewingSerials.length)}
                </Text>
              </InlineStack>
            )}

            {loadingSerials ? (
              <SkeletonBodyText lines={5} />
            ) : viewingSerials.length === 0 ? (
              <EmptyState
                heading="No serials assigned"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>No serial numbers have been assigned to this variant yet.</p>
              </EmptyState>
            ) : (
              <Card>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text']}
                    headings={['Serial Number', 'Status', 'Order ID']}
                    rows={viewingSerials.map(serial => [
                      serial.serialNumber,
                      <Badge
                        key={serial.serialNumber}
                        tone={
                          serial.status === 'AVAILABLE' ? 'info' :
                          serial.status === 'ASSIGNED' ? 'success' :
                          serial.status === 'RESERVED' ? 'warning' :
                          serial.status === 'SOLD' ? undefined :
                          serial.status === 'RETURNED' ? 'critical' : 'info'
                        }
                      >
                        {serial.status}
                      </Badge>,
                      serial.orderId || '-'
                    ])}
                  />
                </div>
              </Card>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
