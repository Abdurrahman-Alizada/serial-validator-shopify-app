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
  FormLayout,
  DropZone,
  Checkbox,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import prisma, { createSerial, getUnassignedSerials, updateSerial, deleteSerial } from "../db.server";

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
    const availableCount = serials.filter(s => s.status === 'AVAILABLE').length;
    const assignedCount = serials.filter(s => s.status === 'ASSIGNED').length;
    const reservedCount = serials.filter(s => s.status === 'RESERVED').length;
    const soldCount = serials.filter(s => s.status === 'SOLD').length;
    const returnedCount = serials.filter(s => s.status === 'RETURNED').length;
    const deletedCount = serials.filter(s => s.status === 'DELETED').length;

    // Get all products with variants for the modal dropdowns
    const products = await prisma.product.findMany({
      where: { shop: session.shop },
      include: {
        variants: true,
      },
      orderBy: { title: 'asc' },
    });

    // Get all variants with their products for easier variant-centric workflow
    const variants = await prisma.productVariant.findMany({
      where: {
        product: { shop: session.shop }
      },
      include: {
        product: true,
      },
      orderBy: [
        { product: { title: 'asc' } },
        { title: 'asc' }
      ]
    });

    // Get unassigned serials for the assignment modal
    const unassignedSerials = await getUnassignedSerials(session.shop);

    return {
      serials,
      stats: {
        total: totalSerials,
        available: availableCount,
        assigned: assignedCount,
        reserved: reservedCount,
        sold: soldCount,
        returned: returnedCount,
        deleted: deletedCount,
      },
      products,
      variants,
      unassignedSerials,
    };
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    return {
      serials: [],
      stats: { total: 0, available: 0, assigned: 0, reserved: 0, sold: 0, returned: 0, deleted: 0 },
      products: [],
      variants: [],
      unassignedSerials: [],
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "addSerial") {
    const serialNumber = formData.get("serialNumber") as string;

    if (!serialNumber) {
      return { success: false, message: "Serial number is required" };
    }

    try {
      // Create as unassigned serial (AVAILABLE status)
      await createSerial({
        serialNumber,
        productId: undefined,
        variantId: undefined,
        shop: session.shop,
      });

      return { success: true, message: "Serial number added successfully. Assign it to a product from the Products screen." };
    } catch (error) {
      console.error("Error creating serial:", error);
      return { success: false, message: "Failed to add serial number" };
    }
  }

  if (intent === "editSerial") {
    const serialId = formData.get("serialId") as string;
    const serialNumber = formData.get("serialNumber") as string;

    if (!serialId || !serialNumber) {
      return { success: false, message: "Serial ID and number are required" };
    }

    try {
      // First verify this serial belongs to the current shop
      const existingSerial = await prisma.serial.findFirst({
        where: { id: serialId, shop: session.shop },
      });

      if (!existingSerial) {
        return { success: false, message: "Serial number not found" };
      }

      // Only update the serial number, keep product/variant assignments as-is
      // Product assignments should be managed from the Products screen
      await updateSerial({
        id: serialId,
        serialNumber,
        productId: existingSerial.productId,
        variantId: existingSerial.variantId,
      });

      return { success: true, message: "Serial number updated successfully" };
    } catch (error) {
      console.error("Error updating serial:", error);
      return { success: false, message: "Failed to update serial number" };
    }
  }

  if (intent === "deleteSerial") {
    const serialId = formData.get("serialId") as string;

    if (!serialId) {
      return { success: false, message: "Serial ID is required" };
    }

    try {
      // First verify this serial belongs to the current shop
      const existingSerial = await prisma.serial.findFirst({
        where: { id: serialId, shop: session.shop },
      });

      if (!existingSerial) {
        return { success: false, message: "Serial number not found" };
      }

      await deleteSerial(serialId);

      return { success: true, message: "Serial number deleted successfully" };
    } catch (error) {
      console.error("Error deleting serial:", error);
      return { success: false, message: "Failed to delete serial number" };
    }
  }

  if (intent === "bulkDeleteSerials") {
    const serialIdsString = formData.get("serialIds") as string;

    if (!serialIdsString) {
      return { success: false, message: "Serial IDs are required" };
    }

    try {
      const serialIds = JSON.parse(serialIdsString) as string[];

      if (!Array.isArray(serialIds) || serialIds.length === 0) {
        return { success: false, message: "Invalid serial IDs" };
      }

      // Verify all serials belong to the current shop
      const existingSerials = await prisma.serial.findMany({
        where: {
          id: { in: serialIds },
          shop: session.shop
        },
      });

      if (existingSerials.length !== serialIds.length) {
        return {
          success: false,
          message: `Only ${existingSerials.length} of ${serialIds.length} serial numbers found`
        };
      }

      // Delete all serials
      const result = await prisma.serial.deleteMany({
        where: {
          id: { in: serialIds },
          shop: session.shop,
        },
      });

      return {
        success: true,
        message: `Successfully deleted ${result.count} serial number${result.count !== 1 ? 's' : ''}`
      };
    } catch (error) {
      console.error("Error bulk deleting serials:", error);
      return { success: false, message: "Failed to delete serial numbers" };
    }
  }

  return null;
};

export default function Dashboard() {
  const { serials, stats, products, variants } = useLoaderData<typeof loader>();
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [modalActive, setModalActive] = useState(false);
  const [bulkImportModalActive, setBulkImportModalActive] = useState(false);
  const [autoAssignImportModalActive, setAutoAssignImportModalActive] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<string[]>([]);
  const [autoAssignCsvFile, setAutoAssignCsvFile] = useState<File | null>(null);
  const [autoAssignPreviewData, setAutoAssignPreviewData] = useState<Array<{itemNo: string, varNo: string, serial: string, productId?: string, variantId?: string, error?: string}>>([]);
  const [showAutoAssignPreview, setShowAutoAssignPreview] = useState(false);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState('25');
  const [editModalActive, setEditModalActive] = useState(false);
  const [deleteModalActive, setDeleteModalActive] = useState(false);
  const [bulkDeleteModalActive, setBulkDeleteModalActive] = useState(false);
  const [selectedSerialForEdit, setSelectedSerialForEdit] = useState<any>(null);
  const [editSerialNumber, setEditSerialNumber] = useState('');
  const [editSelectedVariant, setEditSelectedVariant] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt-desc');

  const fetcher = useFetcher();
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  }, []);

  const handleProductFilterChange = useCallback((value: string) => {
    setProductFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  }, []);

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

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value);
    setCurrentPage(1); // Reset to first page when sorting changes
  }, []);

  const handleModalToggle = useCallback(() => {
    setModalActive(!modalActive);
    if (!modalActive) {
      setSerialNumber('');
      setSelectedVariant('');
    }
  }, [modalActive]);

  const handleSerialNumberChange = useCallback((value: string) => {
    setSerialNumber(value);
  }, []);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      {
        intent: 'addSerial',
        serialNumber,
      },
      { method: 'post' }
    );
    setModalActive(false);
    setSerialNumber('');
    setSelectedVariant('');
  }, [fetcher, serialNumber]);

  const handleBulkImportToggle = useCallback(() => {
    setBulkImportModalActive(!bulkImportModalActive);
    if (!bulkImportModalActive) {
      setBulkCsvFile(null);
      setCsvPreviewData([]);
      setShowCsvPreview(false);
      setEditingIndex(null);
      setEditValue('');
    }
  }, [bulkImportModalActive]);

  const processCsvFile = useCallback(async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    // Handle different CSV formats
    let serials: string[] = [];

    for (const line of lines) {
      if (line.includes(',')) {
        // Comma-separated values
        const values = line.split(',').map(v => v.trim()).filter(v => v);
        serials.push(...values);
      } else {
        // One per line
        serials.push(line);
      }
    }

    // Remove potential headers
    let filteredSerials = serials.filter(serial =>
      serial.toLowerCase() !== 'serial' &&
      serial.toLowerCase() !== 'serialnumber' &&
      serial.toLowerCase() !== 'serial_number' &&
      serial.length > 0
    );

    // Remove duplicates (case-insensitive)
    const uniqueSerials: string[] = [];
    const seen = new Set<string>();

    filteredSerials.forEach(serial => {
      const lowerSerial = serial.toLowerCase();
      if (!seen.has(lowerSerial)) {
        seen.add(lowerSerial);
        uniqueSerials.push(serial);
      }
    });

    setCsvPreviewData(uniqueSerials);
    setShowCsvPreview(true);
  }, []);

  const handleCsvFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    setBulkCsvFile(file);
    if (file) {
      processCsvFile(file);
    }
  }, [processCsvFile]);

  const handleEditSerial = useCallback((index: number, value: string) => {
    setEditingIndex(index);
    setEditValue(value);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingIndex !== null && editValue.trim()) {
      const trimmedValue = editValue.trim();

      // Check for duplicates (excluding the current index)
      const isDuplicate = csvPreviewData.some((serial, index) =>
        index !== editingIndex && serial.trim().toLowerCase() === trimmedValue.toLowerCase()
      );

      if (isDuplicate) {
        // You could show a toast/banner here, for now we'll just not save
        alert('This serial number already exists in the list!');
        return;
      }

      const newData = [...csvPreviewData];
      newData[editingIndex] = trimmedValue;
      setCsvPreviewData(newData);
      setEditingIndex(null);
      setEditValue('');
    }
  }, [editingIndex, editValue, csvPreviewData]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
  }, []);

  const handleDeleteSerial = useCallback((index: number) => {
    const newData = csvPreviewData.filter((_, i) => i !== index);
    setCsvPreviewData(newData);
  }, [csvPreviewData]);

  const handleAddSerial = useCallback(() => {
    setCsvPreviewData([...csvPreviewData, '']);
    setEditingIndex(csvPreviewData.length);
    setEditValue('');
  }, [csvPreviewData]);

  const handleEditModalToggle = useCallback((serial?: any) => {
    if (serial) {
      setSelectedSerialForEdit(serial);
      setEditSerialNumber(serial.serialNumber);
      setEditSelectedVariant(serial.variantId || '');
    } else {
      setSelectedSerialForEdit(null);
      setEditSerialNumber('');
      setEditSelectedVariant('');
    }
    setEditModalActive(!editModalActive);
  }, [editModalActive]);

  const handleDeleteModalToggle = useCallback((serial?: any) => {
    if (serial) {
      setSelectedSerialForEdit(serial);
    } else {
      setSelectedSerialForEdit(null);
    }
    setDeleteModalActive(!deleteModalActive);
  }, [deleteModalActive]);

  const handleEditSubmit = useCallback(() => {
    if (!selectedSerialForEdit || !editSerialNumber.trim()) return;

    fetcher.submit(
      {
        intent: 'editSerial',
        serialId: selectedSerialForEdit.id,
        serialNumber: editSerialNumber,
      },
      { method: 'post' }
    );
    setEditModalActive(false);
    setSelectedSerialForEdit(null);
    setEditSerialNumber('');
    setEditSelectedVariant('');
  }, [fetcher, selectedSerialForEdit, editSerialNumber]);

  const handleDeleteSubmit = useCallback(() => {
    if (!selectedSerialForEdit) return;

    fetcher.submit(
      {
        intent: 'deleteSerial',
        serialId: selectedSerialForEdit.id,
      },
      { method: 'post' }
    );
    setDeleteModalActive(false);
    setSelectedSerialForEdit(null);
  }, [fetcher, selectedSerialForEdit]);

  const handleBulkDeleteModalToggle = useCallback(() => {
    setBulkDeleteModalActive(!bulkDeleteModalActive);
  }, [bulkDeleteModalActive]);

  const handleBulkDeleteSubmit = useCallback(() => {
    if (selectedSerials.length === 0) return;

    fetcher.submit(
      {
        intent: 'bulkDeleteSerials',
        serialIds: JSON.stringify(selectedSerials),
      },
      { method: 'post' }
    );
    setBulkDeleteModalActive(false);
    setSelectedSerials([]);
  }, [fetcher, selectedSerials]);

  const handleBulkImport = useCallback(() => {
    if (csvPreviewData.length === 0) return;

    // Create a CSV content from the preview data
    const csvContent = csvPreviewData.filter(serial => serial.trim().length > 0).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'preview-serials.csv', { type: 'text/csv' });

    const formData = new FormData();
    formData.append('csvFile', file);

    fetcher.submit(formData, {
      method: 'post',
      action: '/api/bulk-import-unassigned',
      encType: 'multipart/form-data'
    });

    setBulkImportModalActive(false);
    setBulkCsvFile(null);
    setCsvPreviewData([]);
    setShowCsvPreview(false);
    setEditingIndex(null);
    setEditValue('');
  }, [fetcher, csvPreviewData]);

  const handleAutoAssignImportToggle = useCallback(() => {
    setAutoAssignImportModalActive(!autoAssignImportModalActive);
    if (!autoAssignImportModalActive) {
      setAutoAssignCsvFile(null);
      setAutoAssignPreviewData([]);
      setShowAutoAssignPreview(false);
    }
  }, [autoAssignImportModalActive]);

  const processAutoAssignCsvFile = useCallback(async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    if (lines.length === 0) {
      return;
    }

    // Skip header row if it exists
    const dataLines = lines.filter((line, index) => {
      const upper = line.toUpperCase();
      return index === 0 ?
        !(upper.includes('ITEM') && upper.includes('VAR') && upper.includes('SERIAL')) :
        true;
    });

    const parsedData = dataLines.map((line, index) => {
      const values = line.split(',').map(v => v.trim());

      if (values.length < 3) {
        return {
          itemNo: values[0] || '',
          varNo: values[1] || '',
          serial: values[2] || '',
          error: 'Invalid format: Expected 3 columns (ITEM_NO, VAR_NO, SERIAL)'
        };
      }

      const itemNo = values[0];
      const varNo = values[1];
      const serial = values[2];

      // Validate required fields
      if (!itemNo || !serial) {
        return {
          itemNo,
          varNo,
          serial,
          error: 'ITEM_NO and SERIAL are required'
        };
      }

      // Find matching product by handle, SKU, or ID
      const matchingProduct = products.find(p => {
        const itemUpper = itemNo.toUpperCase();
        return (
          p.handle?.toUpperCase() === itemUpper ||
          p.title.toUpperCase() === itemUpper ||
          p.id === itemNo ||
          p.shopifyId === itemNo ||
          p.shopifyId === `gid://shopify/Product/${itemNo}`
        );
      });

      if (!matchingProduct) {
        return {
          itemNo,
          varNo,
          serial,
          error: `Product not found: "${itemNo}"`
        };
      }

      // If VAR_NO is provided and not NULL/empty, find matching variant
      let matchingVariant = null;
      if (varNo && varNo.toUpperCase() !== 'NULL' && varNo !== '-') {
        matchingVariant = matchingProduct.variants?.find(v => {
          const varUpper = varNo.toUpperCase();
          return (
            v.sku?.toUpperCase() === varUpper ||
            v.title?.toUpperCase() === varUpper ||
            v.id === varNo ||
            v.shopifyId === varNo ||
            v.shopifyId === `gid://shopify/ProductVariant/${varNo}`
          );
        });

        if (!matchingVariant) {
          return {
            itemNo,
            varNo,
            serial,
            productId: matchingProduct.id,
            error: `Variant not found: "${varNo}" for product "${matchingProduct.title}"`
          };
        }
      } else {
        // No variant specified or NULL - use default variant (first one)
        matchingVariant = matchingProduct.variants?.[0];
        if (!matchingVariant) {
          return {
            itemNo,
            varNo,
            serial,
            productId: matchingProduct.id,
            error: `No variants found for product "${matchingProduct.title}"`
          };
        }
      }

      return {
        itemNo,
        varNo,
        serial,
        productId: matchingProduct.id,
        variantId: matchingVariant.id,
      };
    });

    setAutoAssignPreviewData(parsedData);
    setShowAutoAssignPreview(true);
  }, [products]);

  const handleAutoAssignCsvFileSelect = useCallback((files: File[]) => {
    const file = files[0];
    setAutoAssignCsvFile(file);
    if (file) {
      processAutoAssignCsvFile(file);
    }
  }, [processAutoAssignCsvFile]);

  const handleAutoAssignImport = useCallback(() => {
    if (autoAssignPreviewData.length === 0) return;

    // Filter out rows with errors
    const validRows = autoAssignPreviewData.filter(row => !row.error && row.productId && row.variantId);

    if (validRows.length === 0) return;

    // Create JSON payload
    const payload = {
      serials: validRows.map(row => ({
        serialNumber: row.serial,
        productId: row.productId,
        variantId: row.variantId,
      }))
    };

    fetcher.submit(
      { intent: 'autoAssignImport', data: JSON.stringify(payload) },
      { method: 'post', action: '/api/auto-assign-import' }
    );

    setAutoAssignImportModalActive(false);
    setAutoAssignCsvFile(null);
    setAutoAssignPreviewData([]);
    setShowAutoAssignPreview(false);
  }, [fetcher, autoAssignPreviewData]);

  const handleSerialSelection = useCallback((serialId: string, checked: boolean) => {
    setSelectedSerials(prev => {
      if (checked) {
        return [...prev, serialId];
      } else {
        return prev.filter(id => id !== serialId);
      }
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean, paginatedSerials: typeof serials) => {
    if (checked) {
      // Select all serials on current page
      const currentPageIds = paginatedSerials.map(serial => serial.id);
      setSelectedSerials(prev => {
        const newSelection = new Set([...prev, ...currentPageIds]);
        return Array.from(newSelection);
      });
    } else {
      // Deselect all serials on current page
      const currentPageIds = new Set(paginatedSerials.map(serial => serial.id));
      setSelectedSerials(prev => prev.filter(id => !currentPageIds.has(id)));
    }
  }, []);

  const statusOptions = [
    { label: 'All', value: 'All' },
    { label: 'Available', value: 'AVAILABLE' },
    { label: 'Assigned', value: 'ASSIGNED' },
    { label: 'Reserved', value: 'RESERVED' },
    { label: 'Sold', value: 'SOLD' },
    { label: 'Returned', value: 'RETURNED' },
    { label: 'Deleted', value: 'DELETED' },
  ];

  const variantOptions = [
    { label: 'Select Variant', value: '' },
    ...(variants || []).map(variant => ({
      label: `${variant.product?.title} - ${variant.title || 'Default Variant'}`,
      value: variant.id,
    })),
  ];

  const productFilterOptions = [
    { label: 'All Products', value: 'All' },
    ...products.map(product => ({
      label: product.title,
      value: product.id,
    })),
  ];

  const sortOptions = [
    { label: 'Newest First', value: 'updatedAt-desc' },
    { label: 'Oldest First', value: 'updatedAt-asc' },
    { label: 'Serial A-Z', value: 'serialNumber-asc' },
    { label: 'Serial Z-A', value: 'serialNumber-desc' },
    { label: 'Product A-Z', value: 'product-asc' },
    { label: 'Product Z-A', value: 'product-desc' },
    { label: 'Status A-Z', value: 'status-asc' },
    { label: 'Status Z-A', value: 'status-desc' },
  ];

  // Filter serials based on search, status, and product
  const filteredSerials = serials.filter(serial => {
    const matchesSearch = !searchValue ||
      serial.serialNumber.toLowerCase().includes(searchValue.toLowerCase()) ||
      serial.orderId?.toLowerCase().includes(searchValue.toLowerCase()) ||
      serial.product?.title.toLowerCase().includes(searchValue.toLowerCase());

    const matchesStatus = statusFilter === 'All' || serial.status === statusFilter;
    const matchesProduct = productFilter === 'All' || serial.productId === productFilter;

    return matchesSearch && matchesStatus && matchesProduct;
  });

  // Sort serials based on selected sort option
  const sortedSerials = [...filteredSerials].sort((a, b) => {
    const [field, direction] = sortBy.split('-') as [string, 'asc' | 'desc'];

    let compareValue = 0;

    switch (field) {
      case 'serialNumber':
        compareValue = a.serialNumber.localeCompare(b.serialNumber);
        break;
      case 'product':
        const productA = a.product?.title || '';
        const productB = b.product?.title || '';
        compareValue = productA.localeCompare(productB);
        break;
      case 'status':
        compareValue = a.status.localeCompare(b.status);
        break;
      case 'updatedAt':
        compareValue = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      default:
        compareValue = 0;
    }

    return direction === 'desc' ? -compareValue : compareValue;
  });

  // Helper function to get badge tone based on status
  const getBadgeTone = (status: string): "success" | "info" | "warning" | "critical" => {
    switch (status) {
      case 'AVAILABLE':
        return 'info';
      case 'ASSIGNED':
        return 'success';
      case 'RESERVED':
        return 'warning';
      case 'SOLD':
        return 'info';
      case 'RETURNED':
        return 'critical';
      case 'DELETED':
        return 'critical';
      default:
        return 'info';
    }
  };

  // Calculate pagination
  const itemsPerPageNum = parseInt(itemsPerPage, 10);
  const totalItems = sortedSerials.length;
  const totalPages = Math.ceil(totalItems / itemsPerPageNum);
  const startIndex = (currentPage - 1) * itemsPerPageNum;
  const endIndex = startIndex + itemsPerPageNum;
  const paginatedSerials = sortedSerials.slice(startIndex, endIndex);

  // Generate rows from paginated data
  const rows = paginatedSerials.map((serial) => [
    <Checkbox
      key={`checkbox-${serial.id}`}
      label=""
      checked={selectedSerials.includes(serial.id)}
      onChange={(checked) => handleSerialSelection(serial.id, checked)}
    />,
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
      <Button size="micro" variant="plain" onClick={() => handleEditModalToggle(serial)}>✏️</Button>
      <Button size="micro" variant="plain" tone="critical" onClick={() => handleDeleteModalToggle(serial)}>🗑️</Button>
    </InlineStack>
  ]);

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* Stats Cards */}
        <Grid>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total Serials</Text>
                <Text as="p" variant="heading2xl">{stats.total.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Available</Text>
                <Text as="p" variant="heading2xl">{stats.available.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Assigned</Text>
                <Text as="p" variant="heading2xl" tone="success">{stats.assigned.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Reserved</Text>
                <Text as="p" variant="heading2xl">{stats.reserved.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Sold</Text>
                <Text as="p" variant="heading2xl">{stats.sold.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Returned</Text>
                <Text as="p" variant="heading2xl" tone="critical">{stats.returned.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Serial Management Section */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">Serial Management</Text>
              </InlineStack>

              <InlineStack gap="300" wrap>
                <Button
                  variant="primary"
                  onClick={handleModalToggle}
                  loading={isLoading}
                  disabled={isLoading}
                >
                  Add Serial
                </Button>
                <Button
                  onClick={handleBulkImportToggle}
                  disabled={isLoading}
                >
                  Bulk Import
                </Button>
                <Button
                  onClick={() => setAutoAssignImportModalActive(true)}
                  disabled={isLoading}
                >
                  Auto-Assign Import
                </Button>
                <Button
                  onClick={() => window.open(`/api/export-serials?format=csv`, '_blank')}
                  disabled={isLoading}
                >
                  Export CSV
                </Button>
              </InlineStack>
            </BlockStack>

            {/* Bulk Actions */}
            {selectedSerials.length > 0 && (
              <BlockStack gap="300">
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      {selectedSerials.length} serial{selectedSerials.length !== 1 ? 's' : ''} selected
                    </Text>
                    <InlineStack gap="300">
                      <Button
                        onClick={() => setSelectedSerials([])}
                        variant="plain"
                      >
                        Clear Selection
                      </Button>
                      <Button
                        onClick={handleBulkDeleteModalToggle}
                        tone="critical"
                        disabled={isLoading}
                      >
                        Delete Selected ({selectedSerials.length})
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Card>
              </BlockStack>
            )}

            {/* Search and Filter */}
            <BlockStack gap="300">
              <div style={{ width: '100%' }}>
                <TextField
                  label="Search"
                  value={searchValue}
                  onChange={handleSearchChange}
                  placeholder="Search by serial or order id..."
                  prefix="🔍"
                  autoComplete="off"
                />
              </div>
              <InlineStack gap="300" wrap>
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <Select
                    label="Product"
                    options={productFilterOptions}
                    value={productFilter}
                    onChange={handleProductFilterChange}
                  />
                </div>
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                  />
                </div>
                <div style={{ flex: '1 1 150px', minWidth: '150px' }}>
                  <Select
                    label="Sort by"
                    options={sortOptions}
                    value={sortBy}
                    onChange={handleSortChange}
                  />
                </div>
              </InlineStack>
            </BlockStack>

            {/* Data Table or Empty State */}
            {filteredSerials.length === 0 ? (
              <EmptyState
                heading="No serial numbers found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {serials.length === 0
                    ? "Get started by adding your first serial number or importing them in bulk."
                    : "Try adjusting your search or filter criteria to see more results."
                  }
                </p>
                {serials.length === 0 && (
                  <InlineStack gap="300" align="center">
                    <Button variant="primary" onClick={handleModalToggle}>
                      Add Serial Number
                    </Button>
                    <Button onClick={handleBulkImportToggle}>
                      Bulk Import
                    </Button>
                  </InlineStack>
                )}
              </EmptyState>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                  ]}
                  headings={[
                    <Checkbox
                      key="select-all"
                      label=""
                      checked={paginatedSerials.length > 0 && paginatedSerials.every(serial => selectedSerials.includes(serial.id))}
                      onChange={(checked) => handleSelectAll(checked, paginatedSerials)}
                    />,
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

      {/* Add Serial Modal */}
      <Modal
        open={modalActive}
        onClose={handleModalToggle}
        title="Add Serial Number"
        primaryAction={{
          content: 'Add Serial',
          onAction: handleSubmit,
          disabled: !serialNumber.trim() || isLoading,
          loading: isLoading,
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
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        open={bulkImportModalActive}
        onClose={handleBulkImportToggle}
        title="Bulk Import Unassigned Serial Numbers"
        primaryAction={{
          content: showCsvPreview
            ? `Import ${csvPreviewData.filter(s => s.trim().length > 0).length} Serial${csvPreviewData.filter(s => s.trim().length > 0).length !== 1 ? 's' : ''}`
            : 'Import Serials',
          onAction: handleBulkImport,
          disabled: (() => {
            if (isLoading) return true;
            if (!bulkCsvFile && !showCsvPreview) return true;
            if (showCsvPreview) {
              const validSerials = csvPreviewData.filter(s => s.trim().length > 0);
              if (validSerials.length === 0) return true;

              // Check for duplicates
              const hasDuplicates = validSerials.some((serial, index) =>
                validSerials.findIndex(s => s.toLowerCase() === serial.toLowerCase()) !== index
              );

              return hasDuplicates;
            }
            return false;
          })(),
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleBulkImportToggle,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <DropZone
              label="CSV File"
              onDrop={handleCsvFileSelect}
              accept=".csv,text/csv"
              allowMultiple={false}
            >
              <DropZone.FileUpload />
            </DropZone>

            {/* CSV Preview Section */}
            {showCsvPreview && csvPreviewData.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      Preview ({csvPreviewData.filter(s => s.trim().length > 0).length} serial numbers)
                    </Text>
                    <InlineStack gap="200">
                      <Button
                        size="micro"
                        onClick={handleAddSerial}
                        disabled={isLoading}
                      >
                        + Add Serial
                      </Button>
                      <Button
                        size="micro"
                        variant="plain"
                        tone="critical"
                        onClick={() => {
                          setCsvPreviewData([]);
                          setShowCsvPreview(false);
                          setBulkCsvFile(null);
                        }}
                        disabled={isLoading}
                      >
                        Clear All
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #e1e3e5',
                    borderRadius: '6px',
                    padding: '8px'
                  }}>
                    <BlockStack gap="100">
                      {csvPreviewData.map((serial, index) => (
                        <div key={index} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '4px',
                          backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'transparent',
                          borderRadius: '4px'
                        }}>
                          <Text as="span" variant="bodySm" tone="subdued" style={{ minWidth: '30px' }}>
                            {index + 1}.
                          </Text>

                          {editingIndex === index ? (
                            <InlineStack gap="100" align="start" blockAlign="center">
                              <TextField
                                label=""
                                value={editValue}
                                onChange={setEditValue}
                                autoComplete="off"
                                size="slim"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveEdit();
                                  } else if (e.key === 'Escape') {
                                    handleCancelEdit();
                                  }
                                }}
                              />
                              <Button size="micro" variant="primary" onClick={handleSaveEdit}>
                                ✓
                              </Button>
                              <Button size="micro" onClick={handleCancelEdit}>
                                ✕
                              </Button>
                            </InlineStack>
                          ) : (
                            <InlineStack gap="100" align="space-between" blockAlign="center">
                              <Text as="span" variant="bodyMd" style={{ flex: 1 }}>
                                {serial || <em style={{ color: '#999' }}>Empty</em>}
                              </Text>
                              <InlineStack gap="50">
                                <Button
                                  size="micro"
                                  variant="plain"
                                  onClick={() => handleEditSerial(index, serial)}
                                  disabled={isLoading}
                                >
                                  ✏️
                                </Button>
                                <Button
                                  size="micro"
                                  variant="plain"
                                  tone="critical"
                                  onClick={() => handleDeleteSerial(index)}
                                  disabled={isLoading}
                                >
                                  🗑️
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          )}
                        </div>
                      ))}
                    </BlockStack>
                  </div>

                  {/* Validation Messages */}
                  <BlockStack gap="200">
                    {csvPreviewData.filter(s => s.trim().length > 0).length !== csvPreviewData.length && (
                      <Text as="p" variant="bodySm" tone="warning">
                        Warning: {csvPreviewData.length - csvPreviewData.filter(s => s.trim().length > 0).length} empty entries will be skipped during import.
                      </Text>
                    )}

                    {(() => {
                      const validSerials = csvPreviewData.filter(s => s.trim().length > 0);
                      const duplicates = validSerials.filter((serial, index) =>
                        validSerials.findIndex(s => s.toLowerCase() === serial.toLowerCase()) !== index
                      );

                      if (duplicates.length > 0) {
                        return (
                          <Text as="p" variant="bodySm" tone="critical">
                            Error: {duplicates.length} duplicate serial number(s) detected. Please remove duplicates before importing.
                          </Text>
                        );
                      }

                      return null;
                    })()}

                    {csvPreviewData.filter(s => s.trim().length > 0).length > 0 && (
                      <Text as="p" variant="bodySm" tone="success">
                        Ready to import {csvPreviewData.filter(s => s.trim().length > 0).length} valid serial number{csvPreviewData.filter(s => s.trim().length > 0).length !== 1 ? 's' : ''}.
                      </Text>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Edit Serial Modal */}
      <Modal
        open={editModalActive}
        onClose={() => handleEditModalToggle()}
        title="Edit Serial Number"
        primaryAction={{
          content: 'Save Changes',
          onAction: handleEditSubmit,
          disabled: !editSerialNumber.trim() || isLoading,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => handleEditModalToggle(),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            {selectedSerialForEdit && (
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Current Status:</strong> <Badge tone={getBadgeTone(selectedSerialForEdit.status)}>
                    {selectedSerialForEdit.status}
                  </Badge>
                </Text>
                {selectedSerialForEdit.product && (
                  <Text as="p" variant="bodyMd">
                    <strong>Assigned to:</strong> {selectedSerialForEdit.product.title} - {selectedSerialForEdit.variant?.title || 'Default Variant'}
                  </Text>
                )}
              </BlockStack>
            )}

            <TextField
              label="Serial Number"
              value={editSerialNumber}
              onChange={setEditSerialNumber}
              placeholder="Enter serial number"
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Delete Serial Modal */}
      <Modal
        open={deleteModalActive}
        onClose={() => handleDeleteModalToggle()}
        title="Delete Serial Number"
        primaryAction={{
          content: 'Delete',
          onAction: handleDeleteSubmit,
          destructive: true,
          disabled: isLoading,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => handleDeleteModalToggle(),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to delete this serial number?
            </Text>
            {selectedSerialForEdit && (
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Serial Number:</strong> {selectedSerialForEdit.serialNumber}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Product:</strong> {selectedSerialForEdit.product?.title || 'N/A'}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Variant:</strong> {selectedSerialForEdit.variant?.title || 'N/A'}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Status:</strong> <Badge tone={getBadgeTone(selectedSerialForEdit.status)}>
                      {selectedSerialForEdit.status}
                    </Badge>
                  </Text>
                </BlockStack>
              </Card>
            )}
            <Text as="p" variant="bodySm" tone="critical">
              This action cannot be undone.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal
        open={bulkDeleteModalActive}
        onClose={handleBulkDeleteModalToggle}
        title="Delete Multiple Serial Numbers"
        primaryAction={{
          content: `Delete ${selectedSerials.length} Serial${selectedSerials.length !== 1 ? 's' : ''}`,
          onAction: handleBulkDeleteSubmit,
          destructive: true,
          disabled: isLoading || selectedSerials.length === 0,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleBulkDeleteModalToggle,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Are you sure you want to delete <strong>{selectedSerials.length}</strong> selected serial number{selectedSerials.length !== 1 ? 's' : ''}?
            </Text>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  This will permanently delete:
                </Text>
                <InlineStack gap="400" wrap>
                  <Text as="p" variant="bodyMd">
                    • {selectedSerials.length} serial number{selectedSerials.length !== 1 ? 's' : ''}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • All associated data
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>

            <Text as="p" variant="bodySm" tone="critical">
              ⚠️ This action cannot be undone. All selected serial numbers will be permanently removed from the database.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Auto-Assign Import Modal */}
      <Modal
        open={autoAssignImportModalActive}
        onClose={handleAutoAssignImportToggle}
        title="Auto-Assign Import"
        primaryAction={{
          content: showAutoAssignPreview && autoAssignPreviewData.length > 0
            ? `Import ${autoAssignPreviewData.filter(r => !r.error).length} Serial${autoAssignPreviewData.filter(r => !r.error).length !== 1 ? 's' : ''}`
            : 'Import Serials',
          onAction: handleAutoAssignImport,
          disabled: (() => {
            if (isLoading) return true;
            if (!showAutoAssignPreview) return true;
            const validRows = autoAssignPreviewData.filter(r => !r.error);
            return validRows.length === 0;
          })(),
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleAutoAssignImportToggle,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Upload a CSV file with 3 columns: <strong>ITEM_NO</strong>, <strong>VAR_NO</strong>, <strong>SERIAL</strong>
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                • ITEM_NO: Product handle, title, or Shopify ID<br/>
                • VAR_NO: Variant SKU, title, Shopify ID, or "NULL" for default variant<br/>
                • SERIAL: Serial number to assign
              </Text>

              <DropZone
                label="CSV File"
                onDrop={handleAutoAssignCsvFileSelect}
                accept=".csv,text/csv"
                allowMultiple={false}
              >
                <DropZone.FileUpload />
              </DropZone>

              {/* CSV Preview Section */}
              {showAutoAssignPreview && autoAssignPreviewData.length > 0 && (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingSm">
                        Preview ({autoAssignPreviewData.filter(r => !r.error).length} valid, {autoAssignPreviewData.filter(r => r.error).length} errors)
                      </Text>
                      <Button
                        size="micro"
                        variant="plain"
                        tone="critical"
                        onClick={() => {
                          setAutoAssignPreviewData([]);
                          setShowAutoAssignPreview(false);
                          setAutoAssignCsvFile(null);
                        }}
                        disabled={isLoading}
                      >
                        Clear All
                      </Button>
                    </InlineStack>

                    <div style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      border: '1px solid #e1e3e5',
                      borderRadius: '6px',
                      padding: '8px'
                    }}>
                      <BlockStack gap="200">
                        {autoAssignPreviewData.map((row, index) => (
                          <div key={index} style={{
                            padding: '8px',
                            backgroundColor: row.error ? '#fff4f4' : (index % 2 === 0 ? '#f9f9f9' : 'transparent'),
                            borderRadius: '4px',
                            borderLeft: row.error ? '3px solid #d72c0d' : '3px solid #008060'
                          }}>
                            <BlockStack gap="100">
                              <InlineStack align="space-between">
                                <Text as="span" variant="bodyMd">
                                  <strong>Row {index + 1}:</strong> {row.serial}
                                </Text>
                                {!row.error && (
                                  <Badge tone="success">Valid</Badge>
                                )}
                                {row.error && (
                                  <Badge tone="critical">Error</Badge>
                                )}
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Item: {row.itemNo} | Variant: {row.varNo || 'NULL'}
                              </Text>
                              {row.error && (
                                <Text as="span" variant="bodySm" tone="critical">
                                  {row.error}
                                </Text>
                              )}
                            </BlockStack>
                          </div>
                        ))}
                      </BlockStack>
                    </div>

                    {/* Summary */}
                    <BlockStack gap="200">
                      {autoAssignPreviewData.filter(r => !r.error).length > 0 && (
                        <Text as="p" variant="bodySm" tone="success">
                          Ready to import {autoAssignPreviewData.filter(r => !r.error).length} serial number{autoAssignPreviewData.filter(r => !r.error).length !== 1 ? 's' : ''} with automatic product/variant assignment.
                        </Text>
                      )}
                      {autoAssignPreviewData.filter(r => r.error).length > 0 && (
                        <Text as="p" variant="bodySm" tone="critical">
                          {autoAssignPreviewData.filter(r => r.error).length} row{autoAssignPreviewData.filter(r => r.error).length !== 1 ? 's' : ''} will be skipped due to errors.
                        </Text>
                      )}
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
