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
  const [fetchingSerials, setFetchingSerials] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedSerialId, setSelectedSerialId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const fetchedProductIds = useRef(new Set());

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

      try {
        // Fetch only new products
        const detailsPromises = newProductIds.map((productId) =>
          fetch(
            `${API_BASE_URL}/api/product-details?productId=gid://shopify/Product/${productId}`,
          )
            .then((res) => res.json())
            .catch((err) => {
              console.error(`Failed to fetch product ${productId}:`, err);
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

        // Fetch unassigned serials if we have shop info
        const shopValue = Object.values(newDetails).find((d) => d.shop)?.shop;
        if (shopValue && unassignedSerials.length === 0) {
          setFetchingSerials(true);
          fetch(
            `${API_BASE_URL}/api/unassigned-serials?shop=${encodeURIComponent(shopValue)}`,
          )
            .then((res) => res.json())
            .then((serialsData) => {
              if (serialsData.success && serialsData.data) {
                setUnassignedSerials(serialsData.data);
              }
            })
            .catch((err) =>
              console.error("Failed to fetch unassigned serials:", err),
            )
            .finally(() => setFetchingSerials(false));
        }
      } catch (err) {
        console.error("Error fetching product details:", err);
      }
    },
    [unassignedSerials.length],
  );

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
        if (
          initialCart &&
          initialCart.lineItems &&
          initialCart.lineItems.length > 0
        ) {
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
      console.error("Error loading cart data:", error);
      if (mounted) {
        setLoading(false);
      }
    }
  }, [fetchProductDetails]);

  const handleAssignSerial = useCallback(() => {
    if (!selectedSerialId || !selectedVariantId) {
      setMessage({ text: "Please select a serial number", type: "error" });
      return;
    }

    const selectedVariantData = selectedVariantId.split("|");
    const productId = selectedVariantData[0];
    const variantId = selectedVariantData[1];

    setAssigning(true);
    setMessage({ text: "Assigning serial...", type: "info" });

    fetch(`${API_BASE_URL}/api/assign-serial-to-variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serialId: selectedSerialId,
        productId: productId,
        variantId: variantId,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setMessage({
            text: "Serial assigned successfully!",
            type: "success",
          });
          setSelectedVariantId(null);
          setSelectedSerialId("");
          setShowAssignment(false);

          // Clear cache and reload
          fetchedProductIds.current.clear();
          const cart = shopify.cart.current.value;
          if (cart && cart.lineItems) {
            fetchProductDetails(cart.lineItems);
          }
        } else {
          setMessage({
            text: data.message || "Failed to assign serial",
            type: "error",
          });
        }
        setAssigning(false);
      })
      .catch((error) => {
        console.error("Assignment error:", error);
        setMessage({ text: "Error assigning serial", type: "error" });
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
            const productImage = line.image || product?.image || null;

            return (
              <s-box key={line.uuid || index} padding="base">
                <s-stack direction="inline" gap="base" alignItems="flex-start">
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

                    {/* Serial Required Badge and Assign Button */}
                    {product && requiresSerial && !variant?.assignedSerial && (
                      <s-stack direction="block" gap="small">
                        <s-badge tone="critical">
                          <s-text type="small">Serial Required</s-text>
                        </s-badge>
                        <s-button
                          variant="secondary"
                          onClick={() => {
                            setSelectedVariantId(`${productId}|${variantId}`);
                            setShowAssignment(true);
                          }}
                        >
                          Assign Serial
                        </s-button>
                      </s-stack>
                    )}

                    {/* Assigned Serial Info */}
                    {requiresSerial && variant?.assignedSerial && (
                      <s-stack direction="block" gap="small">
                        <s-text type="small">
                          Serial: {variant.assignedSerial.serialNumber}
                        </s-text>
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
          {showAssignment && selectedVariantId && (
            <>
              <s-box padding="base">
                <s-text type="strong">Select Serial Number</s-text>
              </s-box>

              {message.text && (
                <s-box padding="base">
                  <s-banner
                    tone={
                      message.type === "success"
                        ? "success"
                        : message.type === "error"
                          ? "critical"
                          : "info"
                    }
                  >
                    <s-text type="generic">{message.text}</s-text>
                  </s-banner>
                </s-box>
              )}

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

                    {unassignedSerials.slice(0, 10).map((serial) => (
                      <s-button
                        key={serial.id}
                        onClick={() => {
                          setSelectedSerialId(serial.id);
                          setMessage({
                            text: `Selected: ${serial.serialNumber}`,
                            type: "success",
                          });
                        }}
                        variant={
                          selectedSerialId === serial.id
                            ? "primary"
                            : "secondary"
                        }
                      >
                        {serial.serialNumber}
                      </s-button>
                    ))}

                    {unassignedSerials.length > 10 && (
                      <s-text type="small">
                        ... and {unassignedSerials.length - 10} more
                      </s-text>
                    )}

                    {selectedSerialId && (
                      <s-stack direction="block" gap="base">
                        <s-button
                          onClick={handleAssignSerial}
                          variant="primary"
                          disabled={assigning}
                        >
                          {assigning ? "Assigning..." : "Confirm Assignment"}
                        </s-button>
                        <s-button
                          onClick={() => {
                            setSelectedVariantId(null);
                            setSelectedSerialId("");
                            setShowAssignment(false);
                            setMessage({ text: "", type: "" });
                          }}
                          variant="secondary"
                          disabled={assigning}
                        >
                          Cancel
                        </s-button>
                      </s-stack>
                    )}
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
          )}

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
