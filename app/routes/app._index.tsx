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
  Grid,
  TextField,
  Select,
  DataTable,
  Pagination,
  Badge,
  Modal,
  FormLayout
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import prisma, { createSerial } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Get all serials with their product and variant info
    const serials = await prisma.serial.findMany({
      where: { shop: session.shop },
      include: {
        product: true,
        variant: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get stats
    const totalSerials = serials.length;
    const soldCount = serials.filter(s => s.status === 'SOLD').length;
    const availableCount = serials.filter(s => s.status === 'AVAILABLE').length;
    const returnedCount = serials.filter(s => s.status === 'RETURNED').length;

    // Get all products with variants for the modal dropdowns
    const products = await prisma.product.findMany({
      where: { shop: session.shop },
      include: {
        variants: true,
      },
      orderBy: { title: 'asc' },
    });

    return {
      serials,
      stats: {
        total: totalSerials,
        sold: soldCount,
        available: availableCount,
        returned: returnedCount,
      },
      products,
    };
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return {
      serials: [],
      stats: { total: 0, sold: 0, available: 0, returned: 0 },
      products: [],
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "addSerial") {
    const serialNumber = formData.get("serialNumber") as string;
    const productId = formData.get("productId") as string;
    const variantId = formData.get("variantId") as string;

    if (!serialNumber || !productId || !variantId) {
      return { success: false, message: "All fields are required" };
    }

    try {
      await createSerial({
        serialNumber,
        productId,
        variantId,
        shop: session.shop,
      });

      return { success: true, message: "Serial number added successfully" };
    } catch (error) {
      console.error("Error creating serial:", error);
      return { success: false, message: "Failed to add serial number" };
    }
  }

  return null;
};

export default function Dashboard() {
  const { serials, stats, products } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalActive, setModalActive] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');

  const fetcher = useFetcher();

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  const handleModalToggle = useCallback(() => {
    setModalActive(!modalActive);
    if (!modalActive) {
      // Reset form when opening modal
      setSerialNumber('');
      setSelectedProduct('');
      setSelectedVariant('');
    }
  }, [modalActive]);

  const handleSerialNumberChange = useCallback((value: string) => {
    setSerialNumber(value);
  }, []);

  const handleProductChange = useCallback((value: string) => {
    setSelectedProduct(value);
    setSelectedVariant(''); // Reset variant when product changes
  }, []);

  const handleVariantChange = useCallback((value: string) => {
    setSelectedVariant(value);
  }, []);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      {
        intent: 'addSerial',
        serialNumber,
        productId: selectedProduct,
        variantId: selectedVariant,
      },
      { method: 'post' }
    );
    // Reset form and close modal
    setModalActive(false);
    setSerialNumber('');
    setSelectedProduct('');
    setSelectedVariant('');
  }, [fetcher, serialNumber, selectedProduct, selectedVariant]);

  const statusOptions = [
    { label: 'All', value: 'All' },
    { label: 'Available', value: 'AVAILABLE' },
    { label: 'Sold', value: 'SOLD' },
    { label: 'Returned', value: 'RETURNED' },
    { label: 'Deleted', value: 'DELETED' },
  ];

  // Generate product options from real data
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
      label: variant.title || 'Default Title',
      value: variant.id,
    })),
  ];

  // Filter serials based on search and status
  const filteredSerials = serials.filter(serial => {
    const matchesSearch = !searchValue ||
      serial.serialNumber.toLowerCase().includes(searchValue.toLowerCase()) ||
      serial.orderId?.toLowerCase().includes(searchValue.toLowerCase()) ||
      serial.product?.title.toLowerCase().includes(searchValue.toLowerCase());

    const matchesStatus = statusFilter === 'All' || serial.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Helper function to get badge tone based on status
  const getBadgeTone = (status: string): "success" | "info" | "warning" | "critical" => {
    switch (status) {
      case 'AVAILABLE':
        return 'success';
      case 'SOLD':
        return 'info';
      case 'RETURNED':
        return 'warning';
      case 'DELETED':
        return 'critical';
      default:
        return 'info';
    }
  };

  // Generate rows from real data
  const rows = filteredSerials.map((serial) => [
    serial.serialNumber,
    serial.product?.title || 'N/A',
    serial.variant?.title || 'N/A',
    <Badge key={`badge-${serial.id}`} tone={getBadgeTone(serial.status)}>
      {serial.status.charAt(0) + serial.status.slice(1).toLowerCase()}
    </Badge>,
    serial.orderId || '-',
    new Date(serial.updatedAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    <InlineStack key={`actions-${serial.id}`} gap="200">
      <Button size="micro" variant="plain" onClick={() => console.log('Edit', serial.id)}>✏️</Button>
      <Button size="micro" variant="plain" tone="critical" onClick={() => console.log('Delete', serial.id)}>🗑️</Button>
    </InlineStack>
  ]);

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Stats Cards */}
        <Grid>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total Serials</Text>
                <Text as="p" variant="heading2xl">{stats.total.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Sold</Text>
                <Text as="p" variant="heading2xl">{stats.sold.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Available</Text>
                <Text as="p" variant="heading2xl">{stats.available.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Returned</Text>
                <Text as="p" variant="heading2xl">{stats.returned.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Serial Management Section */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingLg">Serial Management</Text>
              <InlineStack gap="300">
                <Button variant="primary" onClick={handleModalToggle}>Add Serial</Button>
                <Button>Import CSV</Button>
                <Button>Export CSV</Button>
              </InlineStack>
            </InlineStack>

            {/* Search and Filter */}
            <InlineStack gap="400" align="space-between">
              <div style={{ flexGrow: 1, maxWidth: '400px' }}>
                <TextField
                  label=""
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder="Search by serial or order id..."
                  prefix="🔍"
                  autoComplete="off"
                />
              </div>
              <div style={{ minWidth: '150px' }}>
                <Select
                  label="Status"
                  options={statusOptions}
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                />
              </div>
            </InlineStack>

            {/* Data Table */}
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
                'Serial Number',
                'Product Name',
                'Variant',
                'Status',
                'Order ID',
                'Last Updated',
                'Actions',
              ]}
              rows={rows}
            />

            {/* Pagination */}
            <InlineStack align="space-between">
              <Text as="p" variant="bodyMd" tone="subdued">
                Showing {filteredSerials.length > 0 ? '1' : '0'} to {filteredSerials.length} of {filteredSerials.length} results
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

      {/* Add Serial Modal */}
      <Modal
        open={modalActive}
        onClose={handleModalToggle}
        title="Add Serial Number"
        primaryAction={{
          content: 'Add Serial',
          onAction: handleSubmit,
          disabled: !serialNumber.trim() || !selectedProduct || !selectedVariant,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleModalToggle,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Serial Number"
              value={serialNumber}
              onChange={handleSerialNumberChange}
              placeholder="Enter serial number"
              autoComplete="off"
              helpText="Enter a unique serial number for tracking"
            />

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
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
