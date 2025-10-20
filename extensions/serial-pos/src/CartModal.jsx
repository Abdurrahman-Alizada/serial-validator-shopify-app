import {render} from 'preact';
import {useState, useEffect, useCallback, useRef} from 'preact/hooks';
import {API_BASE_URL} from './config';

export default async () => {
  render(<CartModal />, document.body);
};

function CartModal() {
  const [cartItems, setCartItems] = useState([]);
  const [productDetails, setProductDetails] = useState({});
  const [unassignedSerials, setUnassignedSerials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedSerialId, setSelectedSerialId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fetchedProductIds = useRef(new Set());

  const fetchProductDetails = useCallback(async (lines) => {
    const productIds = [...new Set(lines.map(line => line.productId).filter(Boolean))];

    if (productIds.length === 0) {
      return;
    }

    // Check if we already fetched these products
    const newProductIds = productIds.filter(id => !fetchedProductIds.current.has(id));

    if (newProductIds.length === 0) {
      return; // All products already fetched
    }

    setFetchingDetails(true);
    try {
      // Fetch only new products
      const detailsPromises = newProductIds.map(productId =>
        fetch(`${API_BASE_URL}/api/product-details?productId=gid://shopify/Product/${productId}`)
          .then(res => res.json())
          .catch(err => {
            console.error(`Failed to fetch product ${productId}:`, err);
            return { success: false };
          })
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
      setProductDetails(prev => ({...prev, ...newDetails}));

      // Fetch unassigned serials if we have shop info
      const shopValue = Object.values(newDetails).find(d => d.shop)?.shop;
      if (shopValue && unassignedSerials.length === 0) {
        setFetchingSerials(true);
        fetch(`${API_BASE_URL}/api/unassigned-serials?shop=${encodeURIComponent(shopValue)}`)
          .then(res => res.json())
          .then(serialsData => {
            if (serialsData.success && serialsData.data) {
              setUnassignedSerials(serialsData.data);
            }
          })
          .catch(err => console.error('Failed to fetch unassigned serials:', err))
          .finally(() => setFetchingSerials(false));
      }
    } catch (err) {
      console.error('Error fetching product details:', err);
    } finally {
      setFetchingDetails(false);
    }
  }, [unassignedSerials.length]);

  useEffect(() => {
    let mounted = true;

    try {
      // Subscribe to cart changes
      const unsubscribe = shopify.cart.current.subscribe((cart) => {
        if (!mounted) return;

        if (cart && cart.lineItems && cart.lineItems.length > 0) {
          setCartItems(cart.lineItems);
          fetchProductDetails(cart.lineItems);
        } else {
          setCartItems([]);
          // Don't clear productDetails to avoid re-fetching
        }
        setLoading(false);
      });

      // Initial load
      const initialCart = shopify.cart.current.value;
      if (mounted) {
        if (initialCart && initialCart.lineItems && initialCart.lineItems.length > 0) {
          setCartItems(initialCart.lineItems);
          fetchProductDetails(initialCart.lineItems);
        }
        setLoading(false);
      }

      // Cleanup subscription on unmount
      return () => {
        mounted = false;
        unsubscribe();
      };
    } catch (error) {
      console.error('Error loading cart data:', error);
      if (mounted) {
        setLoading(false);
      }
    }
  }, [fetchProductDetails]);

  const handleAssignSerial = useCallback(() => {
    if (!selectedSerialId || !selectedVariantId) {
      setMessage({ text: 'Please select a serial number', type: 'error' });
      return;
    }

    const selectedVariantData = selectedVariantId.split('|');
    const productId = selectedVariantData[0];
    const variantId = selectedVariantData[1];

    setAssigning(true);
    setMessage({ text: 'Assigning serial...', type: 'info' });

    fetch(`${API_BASE_URL}/api/assign-serial-to-variant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serialId: selectedSerialId,
        productId: productId,
        variantId: variantId
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMessage({ text: 'Serial assigned successfully!', type: 'success' });
          setSelectedVariantId(null);
          setSelectedSerialId('');
          setShowAssignment(false);

          // Clear cache and reload
          fetchedProductIds.current.clear();
          const cart = shopify.cart.current.value;
          if (cart && cart.lineItems) {
            fetchProductDetails(cart.lineItems);
          }
        } else {
          setMessage({ text: data.message || 'Failed to assign serial', type: 'error' });
        }
        setAssigning(false);
      })
      .catch(error => {
        console.error('Assignment error:', error);
        setMessage({ text: 'Error assigning serial', type: 'error' });
        setAssigning(false);
      });
  }, [selectedSerialId, selectedVariantId, fetchProductDetails]);

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
      <s-page heading="Cart">
        <s-scroll-box>
          <s-box padding="small">
            <s-text>No items in cart</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading="Cart">
      <s-scroll-box padding="base">
        <s-stack direction="block" gap="base">
          {/* Cart Summary */}
          <s-box padding="small">
            <s-text type="strong">{cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}</s-text>
          </s-box>

          {/* Cart Items */}
          {cartItems.map((line, index) => {
            const productTitle = line.title || 'Unknown Product';
            const quantity = line.quantity || 1;
            const price = line.price ? `$${line.price}` : '';
            const productId = line.productId;
            const variantId = line.variantId;

            // Get product details from state
            const product = productDetails[productId];

            // Try multiple matching strategies for variant
            const variant = product?.variants?.find(v => {
              // Try exact match with GID format
              if (v.shopifyId === `gid://shopify/ProductVariant/${variantId}`) return true;
              // Try numeric ID match (extract from GID)
              const numericId = v.shopifyId?.split('/').pop();
              if (numericId === String(variantId)) return true;
              // Try direct match
              if (v.shopifyId === String(variantId)) return true;
              return false;
            });

            const requiresSerial = variant?.requireSerial || false;

            return (
              <s-box key={line.uuid || index} padding="small">
                <s-stack direction="block" gap="small">
                  {/* Product Title and Serial Badge */}
                  <s-stack direction="inline" gap="small">
                    <s-text type="strong">{productTitle}</s-text>
                    {product && (
                      requiresSerial ? (
                        <s-badge tone="critical">
                          <s-text type="small">Serial Required</s-text>
                        </s-badge>
                      ) : (
                        <s-badge tone="success">
                          <s-text type="small">No Serial</s-text>
                        </s-badge>
                      )
                    )}
                    {!product && fetchingDetails && (
                      <s-text type="small" color="subdued">Loading...</s-text>
                    )}
                  </s-stack>

                  {/* Quantity and Price Row */}
                  <s-stack direction="inline" gap="small">
                    <s-text type="generic">Qty: {quantity}</s-text>
                    {price && <s-text type="generic">{price}</s-text>}
                  </s-stack>

                  {/* SKU if available */}
                  {line.sku && (
                    <s-text type="small" color="subdued">SKU: {line.sku}</s-text>
                  )}

                  {/* Vendor if available */}
                  {line.vendor && (
                    <s-text type="small" color="subdued">{line.vendor}</s-text>
                  )}

                  {/* Serial Assignment Section */}
                  {requiresSerial && variant && (
                    <s-stack direction="block" gap="small">
                      {variant.assignedSerial ? (
                        <s-stack direction="block" gap="small">
                          <s-badge tone="info">
                            <s-text type="small">Assigned: {variant.assignedSerial.serialNumber}</s-text>
                          </s-badge>
                          <s-text type="small" color="subdued">Status: {variant.assignedSerial.status}</s-text>
                        </s-stack>
                      ) : (
                        <s-stack direction="block" gap="small">
                          <s-badge tone="warning">
                            <s-text type="small">No Serial Assigned</s-text>
                          </s-badge>
                          <s-button
                            onClick={() => {
                              const variantKey = `${product.id}|${variant.id}`;
                              setSelectedVariantId(variantKey);
                              setSelectedSerialId('');
                              setShowAssignment(true);
                              setMessage({ text: '', type: '' });
                            }}
                            variant="primary"
                          >
                            Assign Serial
                          </s-button>
                        </s-stack>
                      )}
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            );
          })}

          {/* Serial Assignment Section */}
          {showAssignment && selectedVariantId && (
            <>
              <s-box padding="small">
                <s-text type="strong">Select Serial Number</s-text>
              </s-box>

              {message.text && (
                <s-box padding="small">
                  <s-text type={message.type === 'success' ? 'strong' : 'generic'}>
                    {message.text}
                  </s-text>
                </s-box>
              )}

              {fetchingSerials ? (
                <s-box padding="small">
                  <s-text>Loading available serials...</s-text>
                </s-box>
              ) : unassignedSerials.length > 0 ? (
                <s-stack direction="block" gap="small">
                  <s-box padding="small">
                    <s-text type="small">Available Unassigned Serials ({unassignedSerials.length}):</s-text>
                  </s-box>

                  {unassignedSerials.slice(0, 10).map((serial) => (
                    <s-button
                      key={serial.id}
                      onClick={() => {
                        setSelectedSerialId(serial.id);
                        setMessage({ text: `Selected: ${serial.serialNumber}`, type: 'success' });
                      }}
                      variant={selectedSerialId === serial.id ? 'primary' : 'secondary'}
                    >
                      {serial.serialNumber}
                    </s-button>
                  ))}

                  {unassignedSerials.length > 10 && (
                    <s-box padding="small">
                      <s-text type="small" color="subdued">... and {unassignedSerials.length - 10} more</s-text>
                    </s-box>
                  )}

                  {selectedSerialId && (
                    <s-stack direction="block" gap="small">
                      <s-button
                        onClick={handleAssignSerial}
                        variant="primary"
                        disabled={assigning}
                      >
                        {assigning ? 'Assigning...' : 'Confirm Assignment'}
                      </s-button>
                      <s-button
                        onClick={() => {
                          setSelectedVariantId(null);
                          setSelectedSerialId('');
                          setShowAssignment(false);
                          setMessage({ text: '', type: '' });
                        }}
                        variant="secondary"
                        disabled={assigning}
                      >
                        Cancel
                      </s-button>
                    </s-stack>
                  )}
                </s-stack>
              ) : (
                <s-box padding="small">
                  <s-text>No unassigned serials available.</s-text>
                </s-box>
              )}
            </>
          )}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
