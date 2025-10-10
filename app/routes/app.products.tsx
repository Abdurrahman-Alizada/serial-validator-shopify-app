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
  TextField,
  Select,
  DataTable,
  Pagination,
  Checkbox
} from "@shopify/polaris";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Products() {
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
      onClick={onChange}
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

  const rows = [
    [
      'Eco-Friendly Water Bottle',
      '500ml',
      'WB-500-GRN',
      '25',
      <Toggle key="toggle-1" checked={true} onChange={() => {}} />
    ],
    [
      'Organic Cotton T-Shirt',
      'Medium',
      'TS-M-ORG',
      '42',
      <Toggle key="toggle-2" checked={false} onChange={() => {}} />
    ],
    [
      'Wireless Headphones',
      'Black',
      'HP-WL-BLK',
      '18',
      <Toggle key="toggle-3" checked={true} onChange={() => {}} />
    ],
    [
      'Leather Wallet',
      'Brown',
      'WL-BRN-LTH',
      '60',
      <Toggle key="toggle-4" checked={false} onChange={() => {}} />
    ],
    [
      'Stainless Steel Watch',
      'Silver',
      'WT-SLV-STL',
      '33',
      <Toggle key="toggle-5" checked={true} onChange={() => {}} />
    ],
    [
      'Bamboo Toothbrush',
      'Single',
      'TB-BAM-SGL',
      '105',
      <Toggle key="toggle-6" checked={false} onChange={() => {}} />
    ],
    [
      'Recycled Paper Notebook',
      'A5',
      'NB-A5-REC',
      '80',
      <Toggle key="toggle-7" checked={false} onChange={() => {}} />
    ],
  ];

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
                  <Text as="label" variant="bodyMd" tone="subdued">Sort</Text>
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
                'text',
                'text',
              ]}
              headings={[
                'Product Name',
                'Variant',
                'SKU',
                'Serial Numbers',
                'Require Serial',
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