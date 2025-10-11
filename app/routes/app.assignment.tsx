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
  Badge,
  Modal,
  FormLayout,
  Banner
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Get products with variants that require serials
    const products = await prisma.product.findMany({
      where: { shop: session.shop },
      include: {
        variants: {
          where: { requireSerial: true },
          include: {
            serials: {
              where: { status: 'AVAILABLE' },
              take: 5 // Just get a few for quick assignment
            }
          }
        }
      },
      orderBy: { title: 'asc' },
    });

    // Filter out products that don't have any variants requiring serials
    const serialRequiredProducts = products.filter(p => p.variants.length > 0);

    return { products: serialRequiredProducts };
  } catch (error) {
    console.error('Error loading assignment data:', error);
    return { products: [] };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "assignSerial") {
      const variantId = formData.get("variantId") as string;
      const serialNumber = formData.get("serialNumber") as string;
      const orderId = formData.get("orderId") as string;

      if (!variantId || !serialNumber) {
        return { success: false, message: "Variant and serial number are required" };
      }

      // Use the existing assign serial API
      const response = await fetch(`${new URL(request.url).origin}/api/assign-serial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, serialNumber, orderId })
      });

      const result = await response.json();
      return result;
    }

    if (intent === "releaseSerial") {
      const serialNumber = formData.get("serialNumber") as string;
      const orderId = formData.get("orderId") as string;

      if (!serialNumber) {
        return { success: false, message: "Serial number is required" };
      }

      // Use the existing release serial API
      const response = await fetch(`${new URL(request.url).origin}/api/release-serial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber, orderId })
      });

      const result = await response.json();
      return result;
    }

    if (intent === "markSold") {
      const serialNumber = formData.get("serialNumber") as string;
      const orderId = formData.get("orderId") as string;

      if (!serialNumber) {
        return { success: false, message: "Serial number is required" };
      }

      // Use the existing mark sold API
      const response = await fetch(`${new URL(request.url).origin}/api/mark-serial-sold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber, orderId })
      });

      const result = await response.json();
      return result;
    }

    return { success: false, message: "Unknown action" };
  } catch (error) {
    console.error("Assignment action error:", error);
    return { success: false, message: "Operation failed" };
  }
};

export default function SerialAssignment() {
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [orderId, setOrderId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [assignModalActive, setAssignModalActive] = useState(false);
  const [currentAction, setCurrentAction] = useState<'assign' | 'release' | 'sell'>('assign');

  const handleProductChange = useCallback((value: string) => {
    setSelectedProduct(value);
    setSelectedVariant('');
    setSerialNumber('');
  }, []);

  const handleVariantChange = useCallback((value: string) => {
    setSelectedVariant(value);
    setSerialNumber('');
  }, []);

  const handleOpenAssignModal = useCallback((action: 'assign' | 'release' | 'sell') => {
    setCurrentAction(action);
    setAssignModalActive(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setAssignModalActive(false);
    setSerialNumber('');
    setOrderId('');
  }, []);

  const handleSubmitAction = useCallback(() => {
    let intent = '';
    let data: any = { orderId };

    switch (currentAction) {
      case 'assign':
        intent = 'assignSerial';
        data = { variantId: selectedVariant, serialNumber, orderId };
        break;
      case 'release':
        intent = 'releaseSerial';
        data = { serialNumber, orderId };
        break;
      case 'sell':
        intent = 'markSold';
        data = { serialNumber, orderId };
        break;
    }

    fetcher.submit(
      { intent, ...data },
      { method: 'post' }
    );

    handleCloseModal();
  }, [fetcher, currentAction, selectedVariant, serialNumber, orderId]);

  // Generate product options
  const productOptions = [
    { label: 'Select Product', value: '' },
    ...products.map(product => ({
      label: product.title,
      value: product.id,
    })),
  ];

  // Generate variant options based on selected product
  const selectedProductData = products.find(p => p.id === selectedProduct);
  const variantOptions = [
    { label: 'Select Variant', value: '' },
    ...(selectedProductData?.variants || []).map(variant => ({
      label: `${variant.title || 'Default Title'} (${variant.serials.length} available)`,
      value: variant.id,
    })),
  ];

  // Get available serials for selected variant
  const selectedVariantData = selectedProductData?.variants.find(v => v.id === selectedVariant);
  const availableSerials = selectedVariantData?.serials || [];

  // Generate rows for available serials
  const serialRows = availableSerials.map((serial) => [
    serial.serialNumber,
    selectedProductData?.title || 'N/A',
    selectedVariantData?.title || 'Default Title',
    <Badge key={`badge-${serial.id}`} tone="success">Available</Badge>,
    <InlineStack key={`actions-${serial.id}`} gap="200">
      <Button 
        size="micro" 
        onClick={() => {
          setSerialNumber(serial.serialNumber);
          handleOpenAssignModal('assign');
        }}
      >
        Assign
      </Button>
      <Button 
        size="micro" 
        tone="success"
        onClick={() => {
          setSerialNumber(serial.serialNumber);
          handleOpenAssignModal('sell');
        }}
      >
        Mark Sold
      </Button>
    </InlineStack>
  ]);

  const getModalTitle = () => {
    switch (currentAction) {
      case 'assign': return 'Assign Serial to Order';
      case 'release': return 'Release Serial from Order';
      case 'sell': return 'Mark Serial as Sold';
      default: return 'Serial Operation';
    }
  };

  const getSubmitButtonText = () => {
    switch (currentAction) {
      case 'assign': return 'Assign Serial';
      case 'release': return 'Release Serial';
      case 'sell': return 'Mark as Sold';
      default: return 'Submit';
    }
  };

  return (
    <Page title="Serial Assignment" subtitle="Assign, release, and manage serial numbers for orders">
      <BlockStack gap="500">
        {/* Instructions Banner */}
        <Banner>
          <Text as="p">
            Use this interface to manually assign serial numbers to orders, release reserved serials, 
            or mark serials as sold. This simulates POS checkout workflows where staff need to 
            associate specific serial numbers with customer orders.
          </Text>
        </Banner>

        {/* Product and Variant Selection */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Product Selection</Text>
            
            <InlineStack gap="400" align="space-between">
              <div style={{ flex: 1, maxWidth: '300px' }}>
                <Select
                  label="Product"
                  options={productOptions}
                  value={selectedProduct}
                  onChange={handleProductChange}
                  placeholder="Select a product"
                />
              </div>
              
              <div style={{ flex: 1, maxWidth: '300px' }}>
                <Select
                  label="Variant"
                  options={variantOptions}
                  value={selectedVariant}
                  onChange={handleVariantChange}
                  placeholder="Select a variant"
                  disabled={!selectedProduct}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                <Button 
                  variant="primary"
                  onClick={() => handleOpenAssignModal('assign')}
                  disabled={!selectedVariant}
                >
                  Assign Serial
                </Button>
                <Button 
                  onClick={() => handleOpenAssignModal('release')}
                >
                  Release Serial
                </Button>
              </div>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Available Serials Table */}
        {selectedVariant && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingLg">
                  Available Serials ({availableSerials.length})
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Showing first 5 available serials for quick assignment
                </Text>
              </InlineStack>

              {availableSerials.length > 0 ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Serial Number', 'Product', 'Variant', 'Status', 'Actions']}
                  rows={serialRows}
                />
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No available serials found for this variant. Import serials first.
                </Text>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Recent Operations */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Quick Actions</Text>
            
            <InlineStack gap="300">
              <Button onClick={() => handleOpenAssignModal('assign')}>
                Assign Serial to Order
              </Button>
              <Button onClick={() => handleOpenAssignModal('release')}>
                Release Serial from Order
              </Button>
              <Button onClick={() => handleOpenAssignModal('sell')}>
                Mark Serial as Sold
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Assignment Modal */}
        <Modal
          open={assignModalActive}
          onClose={handleCloseModal}
          title={getModalTitle()}
          primaryAction={{
            content: getSubmitButtonText(),
            onAction: handleSubmitAction,
            disabled: !serialNumber || (currentAction === 'assign' && !selectedVariant),
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: handleCloseModal,
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              {currentAction === 'assign' && (
                <>
                  <Select
                    label="Product"
                    options={productOptions}
                    value={selectedProduct}
                    onChange={handleProductChange}
                    placeholder="Select a product"
                  />

                  <Select
                    label="Variant"
                    options={variantOptions}
                    value={selectedVariant}
                    onChange={handleVariantChange}
                    placeholder="Select a variant"
                    disabled={!selectedProduct}
                  />
                </>
              )}

              <TextField
                label="Serial Number"
                value={serialNumber}
                onChange={setSerialNumber}
                placeholder="Enter serial number"
                autoComplete="off"
                helpText={
                  currentAction === 'assign' 
                    ? "Enter the serial number to assign to this order"
                    : currentAction === 'release'
                    ? "Enter the serial number to release from reservation"
                    : "Enter the serial number to mark as sold"
                }
              />

              <TextField
                label="Order ID (Optional)"
                value={orderId}
                onChange={setOrderId}
                placeholder="Enter order ID"
                autoComplete="off"
                helpText="Associate this operation with a specific order"
              />

              {fetcher.data?.success === false && (
                <Text as="p" variant="bodyMd" tone="critical">
                  {fetcher.data.message}
                </Text>
              )}

              {fetcher.data?.success === true && (
                <Text as="p" variant="bodyMd" tone="success">
                  Operation completed successfully!
                </Text>
              )}
            </FormLayout>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};