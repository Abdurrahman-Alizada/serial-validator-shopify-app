import { render } from "preact";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { API_BASE_URL } from "./config";

export default async () => {
  render(<CartModal />, document.body);
};

function CartModal() {
  const [cartItems, setCartItems] = useState([]);
  const [productDetails, setProductDetails] = useState({});
  const [unassignedSerials, setUnassignedSerials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingProductDetails, setFetchingProductDetails] = useState(false);
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState(null); // Store full line item data
  const [selectedSerialIds, setSelectedSerialIds] = useState([]); // Array of serial IDs
  const [assigning, setAssigning] = useState(false);
  const [assignedSerials, setAssignedSerials] = useState({}); // Track assigned serial IDs per line item
  const [assignedSerialDetails, setAssignedSerialDetails] = useState({}); // Track serial details per line item
  const fetchedProductIds = useRef(new Set());
  const fetchedSerials = useRef(false); // Track if serials have been fetched
  const previousCartKeys = useRef(new Set()); // Track previous cart items for cleanup

  // View state - 'cart' or 'serial-assignment'
  const [currentView, setCurrentView] = useState('cart');

  // Generate a stable key for tracking line items based on product, variant, and line item UUID
  // This ensures assignments persist even when quantity changes
  const getStableKey = useCallback((line) => {
    const lineItemId = line.uuid || line.id;
    return `serial_assignment_${line.productId}_${line.variantId}_${lineItemId}`;
  }, []);

  const reloadUnassignedSerials = useCallback((shopValue, productId, variantId) => {
    if (!shopValue || !productId || !variantId) return;

    setFetchingSerials(true);
    fetch(
      `${API_BASE_URL}/api/unassigned-serials?shop=${encodeURIComponent(shopValue)}&productId=${encodeURIComponent(productId)}&variantId=${encodeURIComponent(variantId)}`,
    )
      .then((res) => res.json())
      .then((serialsData) => {
        if (serialsData.success && serialsData.data) {
          setUnassignedSerials(serialsData.data);
        }
      })
      .catch(() => {
        // Silently fail - no console in POS extensions
      })
      .finally(() => setFetchingSerials(false));
  }, []);

  const fetchProductDetails = useCallback(
    async (lines) => {
      const productIds = [
        ...new Set(lines.map((line) => line.productId).filter(Boolean)),
      ];

      if (productIds.length === 0) {
        return;
      }

      // Check if we already fetched these products
      const newProductIds = productIds.filter(
        (id) => !fetchedProductIds.current.has(id),
      );

      if (newProductIds.length === 0) {
        return; // All products already fetched
      }

      setFetchingProductDetails(true);

      try {
        // Fetch only new products
        const detailsPromises = newProductIds.map((productId) =>
          fetch(
            `${API_BASE_URL}/api/product-details?productId=gid://shopify/Product/${productId}`,
          )
            .then((res) => res.json())
            .catch(() => {
              // Silently fail - no console in POS extensions
              return { success: false };
            }),
        );

        const results = await Promise.all(detailsPromises);

        const newDetails = {};
        results.forEach((result, index) => {
          if (result.success && result.data) {
            const productId = newProductIds[index];
            newDetails[productId] = result.data;
            fetchedProductIds.current.add(productId);
          }
        });

        // Merge with existing details
        setProductDetails((prev) => ({ ...prev, ...newDetails }));

        // Note: We don't fetch serials globally anymore
        // Serials are fetched per line item when the user clicks "Assign Serials"
      } catch (err) {
        // Silently fail - no console in POS extensions
      } finally {
        setFetchingProductDetails(false);
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    // Comprehensive cleanup - validates ALL storage against current cart
    const cleanupAllStorage = async (lines) => {
      try {
        // Get all storage entries
        const allEntries = await shopify.storage.entries();

        if (!lines || lines.length === 0) {
          // Cart is empty - delete ALL serial assignment storage
          const deletePromises = [];
          for (const [key] of allEntries) {
            if (key.startsWith('serial_assignment_')) {
              deletePromises.push(shopify.storage.delete(key));
            }
          }

          if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
          }

          previousCartKeys.current.clear();
        } else {
          // Cart has items - build current cart keys
          const currentCartKeys = new Set();
          for (const line of lines) {
            currentCartKeys.add(getStableKey(line));
          }

          // Delete any storage entries that don't match current cart
          const deletePromises = [];
          for (const [key] of allEntries) {
            if (key.startsWith('serial_assignment_') && !currentCartKeys.has(key)) {
              deletePromises.push(shopify.storage.delete(key));
            }
          }

          if (deletePromises.length > 0) {
            await Promise.all(deletePromises);
          }

          // Update tracking
          previousCartKeys.current = currentCartKeys;
        }
      } catch (error) {
        // Silently fail - no console in POS extensions
      }
    };

    const syncAssignmentsFromStorage = async (lines) => {
      try {
        // First, clean up ALL storage against current cart
        await cleanupAllStorage(lines);

        const assignments = {};
        const serialDetails = {};

        // Now load assignments for current cart items
        if (lines && lines.length > 0) {
          for (const line of lines) {
            const stableKey = getStableKey(line);
            const storedData = await shopify.storage.get(stableKey);
            const currentLineItemId = line.uuid || line.id;

            // Type check the stored data
            if (
              storedData &&
              typeof storedData === 'object' &&
              'serialIds' in storedData &&
              Array.isArray(storedData.serialIds) &&
              storedData.serialIds.length > 0
            ) {
              // Check if this is from the same cart session by comparing UUIDs
              const storedUuid = storedData.lineItemUuid;
              const isSameSession = storedUuid === currentLineItemId;
              const currentQuantity = line.quantity || 1;
              const storedQuantity = storedData.serialIds.length;

              if (isSameSession) {
                // Same session - check quantity
                if (storedQuantity <= currentQuantity) {
                  // Quantity same or increased - keep existing assignments (partial or full)
                  assignments[currentLineItemId] = storedData.serialIds;

                  // Store serial details if available
                  if ('serials' in storedData && Array.isArray(storedData.serials)) {
                    serialDetails[currentLineItemId] = storedData.serials;
                  }
                } else {
                  // Quantity decreased - clear the stale assignment
                  await shopify.storage.delete(stableKey);
                }
              } else {
                // Different session - clear the stale assignment
                await shopify.storage.delete(stableKey);
              }
            }
          }
        }

        if (mounted) {
          // Always set state to match current cart (clear old assignments)
          setAssignedSerials(assignments);
          setAssignedSerialDetails(serialDetails);
        }
      } catch (error) {
        // Silently fail - no console in POS extensions
      }
    };

    try {
      // Subscribe to cart changes
      const unsubscribe = shopify.cart.current.subscribe((cart) => {
        if (!mounted) return;

        if (cart && cart.lineItems && cart.lineItems.length > 0) {
          setCartItems(cart.lineItems);
          fetchProductDetails(cart.lineItems);

          // Sync assignments and clean up orphaned storage
          syncAssignmentsFromStorage(cart.lineItems);
        } else {
          // Cart is empty - sync with empty cart to clean up all storage
          syncAssignmentsFromStorage([]);
          setCartItems([]);
          setAssignedSerials({});
          setAssignedSerialDetails({});
          // Don't clear productDetails to avoid re-fetching
        }
        setLoading(false);
      });

      // Initial load
      const initialCart = shopify.cart.current.value;
      if (mounted) {
        if (
          initialCart &&
          initialCart.lineItems &&
          initialCart.lineItems.length > 0
        ) {
          setCartItems(initialCart.lineItems);
          fetchProductDetails(initialCart.lineItems);
          syncAssignmentsFromStorage(initialCart.lineItems);
        } else {
          // Initial cart is empty - clean up any orphaned storage
          syncAssignmentsFromStorage([]);
        }
        setLoading(false);
      }

      // Cleanup subscription on unmount
      return () => {
        mounted = false;
        unsubscribe();
      };
    } catch (error) {
      // Silently fail - no console in POS extensions
      if (mounted) {
        setLoading(false);
      }
    }
  }, [fetchProductDetails, getStableKey]);

  const handleAssignSerial = useCallback(() => {
    if (!selectedLineItem || selectedSerialIds.length === 0) {
      return;
    }

    const requiredQuantity = selectedLineItem.quantity || 1;
    const lineItemId = selectedLineItem.uuid || selectedLineItem.id;

    // Get existing assignments
    const existingSerialIds = assignedSerials[lineItemId] || [];
    const existingSerialDetails = assignedSerialDetails[lineItemId] || [];
    const alreadyAssignedCount = existingSerialIds.length;
    const remainingNeeded = requiredQuantity - alreadyAssignedCount;

    // Validate that we're assigning the correct number of additional serials
    if (selectedSerialIds.length !== remainingNeeded) {
      return;
    }

    const productId = selectedLineItem.productId;
    const variantId = selectedLineItem.variantId;

    setAssigning(true);

    // Merge new serials with existing ones
    const allSerialIds = [...existingSerialIds, ...selectedSerialIds];

    fetch(`${API_BASE_URL}/api/assign-serials-to-line-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serialIds: selectedSerialIds, // Only send the NEW serials to backend
        productId: productId,
        variantId: variantId,
        lineItemId: lineItemId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // Get serial details for newly assigned serials
          const newSerialDetails = selectedSerialIds.map(serialId => {
            const serial = unassignedSerials.find(s => s.id === serialId);
            return {
              id: serialId,
              serialNumber: serial?.serialNumber || `Serial #${serialId}`
            };
          });

          // Merge with existing serial details
          const allSerialDetails = [...existingSerialDetails, ...newSerialDetails];

          // Store ALL assigned serials (existing + new) for this line item in state
          setAssignedSerials((prev) => ({
            ...prev,
            [lineItemId]: allSerialIds,
          }));

          // Store ALL serial details in state
          setAssignedSerialDetails((prev) => ({
            ...prev,
            [lineItemId]: allSerialDetails,
          }));

          // Persist ALL serials to Shopify Storage API using stable key
          const stableKey = getStableKey(selectedLineItem);
          shopify.storage.set(stableKey, {
            serialIds: allSerialIds,
            serials: allSerialDetails,
            productId: productId,
            variantId: variantId,
            quantity: selectedLineItem.quantity || 1,
            lineItemUuid: lineItemId, // Store UUID to detect new cart sessions
            timestamp: Date.now()
          });

          // Wait 1 second before closing and returning to cart view
          setTimeout(() => {
            setSelectedLineItem(null);
            setSelectedSerialIds([]);
            setShowAssignment(false);
            setCurrentView('cart');
          }, 1000);

          // Reload unassigned serials for this specific product/variant
          const product = productDetails[productId];
          if (product?.shop) {
            reloadUnassignedSerials(product.shop, productId, variantId);
          }
        }
        setAssigning(false);
      })
      .catch(() => {
        setAssigning(false);
      });
  }, [selectedLineItem, selectedSerialIds, productDetails, reloadUnassignedSerials, getStableKey, unassignedSerials, assignedSerials, assignedSerialDetails]);

  // Show Serial Assignment screen
  if (currentView === 'serial-assignment' && selectedLineItem) {
    const lineItemId = selectedLineItem.uuid || selectedLineItem.id;
    const alreadyAssignedCount = assignedSerials[lineItemId]?.length || 0;
    const totalNeeded = selectedLineItem.quantity || 1;
    const stillNeeded = totalNeeded - alreadyAssignedCount;

    // Load serials for this specific product/variant if not already loaded
    const productId = selectedLineItem.productId;
    const variantId = selectedLineItem.variantId;
    const product = productDetails[productId];

    if (product && unassignedSerials.length === 0 && !fetchingSerials) {
      reloadUnassignedSerials(product.shop, productId, variantId);
    }

    return (
      <s-page heading="Serial Assignment">
        <s-scroll-box>
          <s-stack direction="block" gap="base">
            {/* Header */}
            <s-box padding="base">
              <s-text type="strong">{selectedLineItem.title || "Product"}</s-text>
              <s-text type="small">
                Select {stillNeeded} {alreadyAssignedCount > 0 ? "More " : ""}
                Serial Number{stillNeeded > 1 ? "s" : ""}
              </s-text>
              <s-text type="small">
                {selectedSerialIds.length} of {stillNeeded} selected
                {alreadyAssignedCount > 0 &&
                  ` (${alreadyAssignedCount} already assigned)`}
              </s-text>
            </s-box>

            {/* Serial List */}
            {fetchingSerials ? (
              <s-box padding="base">
                <s-text type="generic">Loading available serials...</s-text>
              </s-box>
            ) : unassignedSerials.length > 0 ? (
              <s-box padding="base">
                <s-stack direction="block" gap="base">
                  <s-text type="small">
                    Available Unassigned Serials ({unassignedSerials.length}):
                  </s-text>

                  {unassignedSerials.slice(0, 20).map((serial) => {
                    const isSelected = selectedSerialIds.includes(serial.id);
                    const canSelect = selectedSerialIds.length < stillNeeded;

                    return (
                      <s-button
                        key={serial.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedSerialIds((prev) =>
                              prev.filter((id) => id !== serial.id)
                            );
                          } else if (canSelect) {
                            setSelectedSerialIds((prev) => [...prev, serial.id]);
                          }
                        }}
                        variant={isSelected ? "primary" : "secondary"}
                        disabled={!isSelected && !canSelect}
                      >
                        {serial.serialNumber}
                        {isSelected && " ✓"}
                      </s-button>
                    );
                  })}

                  {unassignedSerials.length > 20 && (
                    <s-text type="small">
                      ... and {unassignedSerials.length - 20} more
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            ) : (
              <s-box padding="base">
                <s-text type="generic">No unassigned serials available.</s-text>
              </s-box>
            )}

            {/* Action Buttons */}
            <s-box padding="base">
              <s-stack direction="block" gap="base">
                <s-button
                  onClick={handleAssignSerial}
                  variant="primary"
                  disabled={assigning || selectedSerialIds.length !== stillNeeded}
                >
                  {assigning
                    ? "Assigning..."
                    : `Confirm ${selectedSerialIds.length} Serial${selectedSerialIds.length > 1 ? "s" : ""}`}
                </s-button>
                <s-button
                  onClick={() => {
                    setCurrentView('cart');
                    setSelectedLineItem(null);
                    setSelectedSerialIds([]);
                  }}
                  variant="secondary"
                  disabled={assigning}
                >
                  Cancel
                </s-button>
              </s-stack>
            </s-box>
          </s-stack>
        </s-scroll-box>
      </s-page>
    );
  }

  if (loading) {
    return (
      <s-page heading="Cart">
        <s-scroll-box>
          <s-box padding="small">
            <s-text>Loading cart items...</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (cartItems.length === 0) {
    return (
      <s-page heading="New order">
        <s-scroll-box>
          <s-box padding="base">
            <s-text>No items in cart</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  // Calculate totals
  const subtotal = cartItems.reduce((sum, line) => {
    const price = parseFloat(line.price) || 0;
    const quantity = line.quantity || 1;
    return sum + price * quantity;
  }, 0);
  const taxes = 0.0;

  return (
    <s-page heading="New order">
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          {/* Item Count */}
          <s-box padding="base">
            <s-text type="strong">
              {cartItems.length} {cartItems.length === 1 ? "item" : "items"}
            </s-text>
          </s-box>

          {/* Add Customer Section */}
          <s-box padding="base">
            <s-text type="strong">Add customer</s-text>
          </s-box>

          {/* Cart Items */}
          {cartItems.map((line, index) => {
            const productTitle = line.title || "Unknown Product";
            const quantity = line.quantity || 1;
            const price = line.price ? parseFloat(line.price) : 0;
            const totalPrice = (price * quantity).toFixed(2);
            const productId = line.productId;
            const variantId = line.variantId;

            // Get product details from state
            const product = productDetails[productId];

            // Try multiple matching strategies for variant
            const variant = product?.variants?.find((v) => {
              // Try exact match with GID format
              if (v.shopifyId === `gid://shopify/ProductVariant/${variantId}`)
                return true;
              // Try numeric ID match (extract from GID)
              const numericId = v.shopifyId?.split("/").pop();
              if (numericId === String(variantId)) return true;
              // Try direct match
              if (v.shopifyId === String(variantId)) return true;
              return false;
            });

            const requiresSerial = variant?.requireSerial || false;

            // Get product image - try line.image first, then product image
            // const productImage = line.image || product?.image || null;

            return (
              <s-box key={line.uuid || index} padding="base">
                <s-stack direction="inline" gap="base" alignItems="start">
                  {/* Product Details */}
                  <s-stack direction="block" gap="small">
                    <s-stack
                      direction="inline"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      {/* <s-image
                        src={
                          productImage ||
                          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_small.png"
                        }
                      /> */}
                      <s-text type="strong">{productTitle}</s-text>
                      <s-text type="strong">${totalPrice}</s-text>
                    </s-stack>

                    {quantity > 1 && (
                      <s-text type="generic">Qty: {quantity}</s-text>
                    )}

                    {/* Loading state while fetching product details */}
                    {!product && fetchingProductDetails && (
                      <s-stack direction="block" gap="small">
                        <s-text type="small">Checking serial requirements...</s-text>
                      </s-stack>
                    )}

                    {/* Serial Required Badge and Assign Button */}
                    {product && requiresSerial && (
                      <s-stack direction="block" gap="small">
                        {(() => {
                          const lineItemId = line.uuid || line.id;
                          const assignedCount = assignedSerials[lineItemId]?.length || 0;
                          const isFullyAssigned = assignedCount === quantity;
                          const isPartiallyAssigned = assignedCount > 0 && assignedCount < quantity;

                          return (
                            <>
                              {/* Show assigned serials if any */}
                              {assignedCount > 0 && (
                                <s-stack direction="block" gap="small">
                                  <s-text type="strong">
                                    {isFullyAssigned ? '✓ ' : ''}Assigned Serial{assignedCount > 1 ? 's' : ''} ({assignedCount}/{quantity}):
                                  </s-text>
                                  {assignedSerialDetails[lineItemId] ? (
                                    assignedSerialDetails[lineItemId].map((serial) => (
                                      <s-text key={serial.id} type="generic">
                                        • {serial.serialNumber}
                                      </s-text>
                                    ))
                                  ) : (
                                    assignedSerials[lineItemId].map((serialId) => (
                                      <s-text key={serialId} type="generic">
                                        • Serial #{serialId}
                                      </s-text>
                                    ))
                                  )}
                                </s-stack>
                              )}

                              {/* Show assign button if not fully assigned */}
                              {!isFullyAssigned && (
                                <s-button
                                  variant="secondary"
                                  onClick={() => {
                                    setSelectedLineItem(line);
                                    setSelectedSerialIds([]);
                                    setUnassignedSerials([]); // Clear previous serials
                                    setCurrentView('serial-assignment');

                                    // Fetch serials for this specific product/variant
                                    const prod = productDetails[line.productId];
                                    if (prod && prod.shop) {
                                      reloadUnassignedSerials(prod.shop, line.productId, line.variantId);
                                    }
                                  }}
                                >
                                  {isPartiallyAssigned
                                    ? `Assign ${quantity - assignedCount} More Serial${quantity - assignedCount > 1 ? 's' : ''}`
                                    : `Assign Serials (${quantity} needed)`
                                  }
                                </s-button>
                              )}
                            </>
                          );
                        })()}
                      </s-stack>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            );
          })}

          {/* Subtotal Section */}
          <s-box padding="base">
            <s-stack
              direction="inline"
              justifyContent="space-between"
              alignItems="center"
            >
              <s-text type="strong">Subtotal</s-text>
              <s-text type="strong">${subtotal.toFixed(2)}</s-text>
            </s-stack>
          </s-box>

          <s-box />
          {/* Taxes Section */}
          <s-box padding="base">
            <s-stack
              direction="inline"
              justifyContent="space-between"
              alignItems="center"
            >
              <s-text type="strong">Taxes</s-text>
              <s-text type="strong">${taxes.toFixed(2)}</s-text>
            </s-stack>
          </s-box>

          {/* Serial Assignment Modal - Only when assigning */}
          {showAssignment && selectedLineItem && (() => {
            const lineItemId = selectedLineItem.uuid || selectedLineItem.id;
            const alreadyAssigned = assignedSerials[lineItemId]?.length || 0;
            const totalNeeded = selectedLineItem.quantity || 1;
            const stillNeeded = totalNeeded - alreadyAssigned;

            return (
            <>
              <s-box padding="base">
                <s-text type="strong">
                  Select {stillNeeded} {alreadyAssigned > 0 ? 'More ' : ''}Serial Number
                  {stillNeeded > 1 ? "s" : ""}
                </s-text>
                <s-text type="small">
                  {selectedSerialIds.length} of {stillNeeded} selected
                  {alreadyAssigned > 0 && ` (${alreadyAssigned} already assigned)`}
                </s-text>
              </s-box>

              {fetchingSerials ? (
                <s-box padding="base">
                  <s-text type="generic">Loading available serials...</s-text>
                </s-box>
              ) : unassignedSerials.length > 0 ? (
                <s-box padding="base">
                  <s-stack direction="block" gap="base">
                    <s-text type="small">
                      Available Unassigned Serials ({unassignedSerials.length}):
                    </s-text>

                    {unassignedSerials.slice(0, 20).map((serial) => {
                      const isSelected = selectedSerialIds.includes(serial.id);
                      const canSelect = selectedSerialIds.length < stillNeeded;

                      return (
                        <s-button
                          key={serial.id}
                          onClick={() => {
                            if (isSelected) {
                              // Deselect
                              setSelectedSerialIds((prev) =>
                                prev.filter((id) => id !== serial.id),
                              );
                            } else if (canSelect) {
                              // Select
                              setSelectedSerialIds((prev) => [
                                ...prev,
                                serial.id,
                              ]);
                            }
                          }}
                          variant={isSelected ? "primary" : "secondary"}
                          disabled={!isSelected && !canSelect}
                        >
                          {serial.serialNumber}
                          {isSelected && " ✓"}
                        </s-button>
                      );
                    })}

                    {unassignedSerials.length > 20 && (
                      <s-text type="small">
                        ... and {unassignedSerials.length - 20} more
                      </s-text>
                    )}

                    <s-stack direction="block" gap="base">
                      <s-button
                        onClick={handleAssignSerial}
                        variant="primary"
                        disabled={
                          assigning ||
                          selectedSerialIds.length !== stillNeeded
                        }
                      >
                        {assigning
                          ? "Assigning..."
                          : `Confirm ${selectedSerialIds.length} Serial${selectedSerialIds.length > 1 ? "s" : ""}`}
                      </s-button>
                      <s-button
                        onClick={() => {
                          setSelectedLineItem(null);
                          setSelectedSerialIds([]);
                          setShowAssignment(false);
                        }}
                        variant="secondary"
                        disabled={assigning}
                      >
                        Cancel
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-box>
              ) : (
                <s-box padding="base">
                  <s-text type="generic">
                    No unassigned serials available.
                  </s-text>
                </s-box>
              )}
            </>
            );
          })()}

          {/* Checkout Button */}
          <s-box padding="base">
            <s-button variant="primary">
              Checkout ${subtotal.toFixed(2)}
            </s-button>
          </s-box>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
