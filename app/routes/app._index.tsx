import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
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
  Badge
} from "@shopify/polaris";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Dashboard() {
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  const statusOptions = [
    { label: 'All', value: 'All' },
    { label: 'Available', value: 'Available' },
    { label: 'Sold', value: 'Sold' },
    { label: 'Returned', value: 'Returned' },
    { label: 'Deleted', value: 'Deleted' },
  ];

  const rows = [
    [
      'SN12345',
      'Product A',
      'Variant 1',
      <Badge key="badge-1" tone="success">Available</Badge>,
      'Order #123',
      '2024-01-15 10:00',
      <InlineStack key="actions-1" gap="200">
        <Button size="micro" variant="plain">✏️</Button>
        <Button size="micro" variant="plain" tone="critical">🗑️</Button>
      </InlineStack>
    ],
    [
      'SN67890',
      'Product B',
      'Variant 2',
      <Badge key="badge-2" tone="info">Sold</Badge>,
      'Order #456',
      '2024-01-16 12:30',
      <InlineStack key="actions-2" gap="200">
        <Button size="micro" variant="plain">✏️</Button>
        <Button size="micro" variant="plain" tone="critical">🗑️</Button>
      </InlineStack>
    ],
    [
      'SN11223',
      'Product C',
      'Variant 3',
      <Badge key="badge-3" tone="warning">Returned</Badge>,
      'Order #789',
      '2024-01-17 14:45',
      <InlineStack key="actions-3" gap="200">
        <Button size="micro" variant="plain">✏️</Button>
        <Button size="micro" variant="plain" tone="critical">🗑️</Button>
      </InlineStack>
    ],
    [
      'SN33445',
      'Product A',
      'Variant 1',
      <Badge key="badge-4" tone="critical">Deleted</Badge>,
      'Order #123',
      '2024-01-18 09:15',
      <InlineStack key="actions-4" gap="200">
        <Button size="micro" variant="plain">✏️</Button>
        <Button size="micro" variant="plain" tone="critical">🗑️</Button>
      </InlineStack>
    ],
    [
      'SN55667',
      'Product B',
      'Variant 2',
      <Badge key="badge-5" tone="success">Available</Badge>,
      'Order #456',
      '2024-01-19 11:00',
      <InlineStack key="actions-5" gap="200">
        <Button size="micro" variant="plain">✏️</Button>
        <Button size="micro" variant="plain" tone="critical">🗑️</Button>
      </InlineStack>
    ],
  ];

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Stats Cards */}
        <Grid>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total Serials</Text>
                <Text as="p" variant="heading2xl">1,234</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Sold</Text>
                <Text as="p" variant="heading2xl">876</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Available</Text>
                <Text as="p" variant="heading2xl">358</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 3, md: 3, lg: 3, xl: 3}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Returned</Text>
                <Text as="p" variant="heading2xl">12</Text>
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
                <Button variant="primary">Add Serial</Button>
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
                Showing 1 to 5 of 5 results
              </Text>
              <Pagination
                hasPrevious
                onPrevious={() => {}}
                hasNext
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