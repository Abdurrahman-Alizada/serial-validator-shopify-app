import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const API_BASE_URL = 'https://traveling-enb-yacht-rider.trycloudflare.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [currentProduct, setCurrentProduct] = useState(null);
  const [unassignedSerials, setUnassignedSerials] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedSerialId, setSelectedSerialId] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const loadData = () => {
    const productId = shopify.product.id;

    if (!productId) {
      setLoading(false);
      return;
    }

    // First fetch product details to get the shop
    fetch(`${API_BASE_URL}/api/product-details?productId=${productId}`)
      .then(res => res.json())
      .then(productData => {
        if (productData.success && productData.data) {
          setCurrentProduct(productData.data);

          // Now fetch unassigned serials using the shop from product data
          return fetch(`${API_BASE_URL}/api/unassigned-serials?shop=${encodeURIComponent(productData.data.shop)}`);
        }
        throw new Error('Failed to fetch product data');
      })
      .then(res => res.json())
      .then(serialsData => {
        if (serialsData.success && serialsData.data) {
          setUnassignedSerials(serialsData.data);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Fetch error:', error);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAssignSerial = () => {
    if (!selectedVariant || !selectedSerialId) {
      setMessage({ text: 'Please select a serial number', type: 'error' });
      return;
    }

    if (!currentProduct) {
      setMessage({ text: 'Product data not loaded', type: 'error' });
      return;
    }

    setAssigning(true);
    setMessage({ text: 'Assigning serial...', type: 'info' });

    fetch(`${API_BASE_URL}/api/assign-serial-to-variant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serialId: selectedSerialId,
        productId: currentProduct.id,
        variantId: selectedVariant
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMessage({ text: 'Serial assigned successfully!', type: 'success' });
          setSelectedVariant('');
          setSelectedSerialId('');
          // Reload data to show updated assignments
          loadData();
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
  };

  if (loading) {
    return (
      <s-page heading='Serial Assignment'>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>Loading product details...</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (!currentProduct) {
    return (
      <s-page heading='Serial Assignment'>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>No product data found</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  return (
    <s-page heading='Serial Assignment'>
      <s-scroll-box>
        <s-box padding="small">
          <s-stack direction="block" gap="base">
            {/* Current Product Info */}
            <s-section heading="Product Information">
              <s-stack direction="block" gap="small">
                <s-text type="strong">{currentProduct.title}</s-text>
                {currentProduct.productType && <s-text>Type: {currentProduct.productType}</s-text>}
                {currentProduct.vendor && <s-text>Vendor: {currentProduct.vendor}</s-text>}
                <s-text type={currentProduct.requireSerial ? 'strong' : 'generic'}>
                  Requires Serial: {currentProduct.requireSerial ? 'Yes' : 'No'}
                </s-text>
                {currentProduct.handle && <s-text>Handle: {currentProduct.handle}</s-text>}
              </s-stack>
            </s-section>

            {/* Variants */}
            <s-section heading="Variants">
              <s-stack direction="block" gap="small">
                {currentProduct.variants && currentProduct.variants.length > 0 ? (
                  currentProduct.variants.map((variant) => (
                    <s-stack key={variant.id} direction="block" gap="small">
                      {/* Variant Info */}
                      <s-stack direction="block" gap="small">
                        <s-text type="strong">{variant.title || 'Default Title'}</s-text>
                        <s-stack direction="inline" gap="small">
                          {variant.sku && (
                            <s-text type="generic">SKU: {variant.sku}</s-text>
                          )}
                          {variant.price && (
                            <s-text type="generic">Price: ${variant.price}</s-text>
                          )}
                        </s-stack>
                      </s-stack>

                      {/* Serial Status */}
                      {!variant.requireSerial ? (
                        <s-text type="generic">No serial requirement</s-text>
                      ) : variant.assignedSerial ? (
                        <s-stack direction="block" gap="small">
                          <s-text type="strong">Assigned Serial: {variant.assignedSerial.serialNumber}</s-text>
                          <s-text type="generic">Status: {variant.assignedSerial.status}</s-text>
                          {variant.assignedSerial.orderId && (
                            <s-text type="generic">Order: {variant.assignedSerial.orderId}</s-text>
                          )}
                        </s-stack>
                      ) : (
                        <s-stack direction="block" gap="small">
                          <s-text type="generic">No assigned serial</s-text>
                          <s-button
                            onClick={() => {
                              setSelectedVariant(variant.id);
                              setSelectedSerialId('');
                              setMessage({ text: '', type: '' });
                            }}
                            variant="primary"
                          >
                            Assign Serial
                          </s-button>
                        </s-stack>
                      )}
                    </s-stack>
                  ))
                ) : (
                  <s-text>No variants found</s-text>
                )}
              </s-stack>
            </s-section>

            {/* Serial Selection */}
            {selectedVariant && (
              <s-section heading="Select Serial Number">
                {unassignedSerials.length > 0 ? (
                  <s-stack direction="block" gap="small">
                    <s-text>Available Unassigned Serials ({unassignedSerials.length}):</s-text>
                    <s-text type="small">Tap a serial number to select it</s-text>
                    {unassignedSerials.map((serial) => (
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

                    {/* Show selected serial info */}
                    {selectedSerialId && (
                      <s-stack direction="block" gap="small">
                        <s-text type="strong">
                          Selected: {unassignedSerials.find(s => s.id === selectedSerialId)?.serialNumber}
                        </s-text>
                        <s-button
                          onClick={handleAssignSerial}
                          variant="primary"
                          disabled={assigning}
                        >
                          {assigning ? 'Assigning...' : 'Assign Serial to Variant'}
                        </s-button>
                      </s-stack>
                    )}
                  </s-stack>
                ) : (
                  <s-text>No unassigned serials available. Import serials first.</s-text>
                )}
              </s-section>
            )}

            {/* Message Display */}
            {message.text && (
              <s-section>
                <s-text type={message.type === 'success' ? 'strong' : 'generic'}>
                  {message.text}
                </s-text>
              </s-section>
            )}
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
