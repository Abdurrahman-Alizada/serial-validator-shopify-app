import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_BASE_URL = 'https://traveling-enb-yacht-rider.trycloudflare.com';

    fetch(`${API_BASE_URL}/api/products`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setProducts(data.data);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Fetch error:', error);
        setLoading(false);
      });
  }, []);

  return (
    <s-page heading='POS action'>
      <s-scroll-box>
        <s-box padding="small">
          <s-stack direction="block" gap="base">
            <s-text>Welcome to the preact action extension</s-text>

            <s-section heading="Current Product">
              <s-text type="strong">Product ID: {shopify.product.id}</s-text>
              <s-text type="strong">Variant ID: {shopify.product.variantId}</s-text>
            </s-section>

            <s-section heading="Products">
              {loading && <s-text>Loading...</s-text>}

              {!loading && products.length === 0 && (
                <s-text>No products found</s-text>
              )}

              {!loading && products.length > 0 && (
                <s-stack direction="block" gap="small">
                  {products.map((p) => (
                    <s-stack key={p.id} direction="block" gap="small">
                      <s-text type="strong">{p.title}</s-text>
                      {p.productType && <s-text>Type: {p.productType}</s-text>}
                      {p.vendor && <s-text>Vendor: {p.vendor}</s-text>}
                      {p.variants && p.variants.length > 0 && (
                        <s-text>Variants: {p.variants.length}</s-text>
                      )}
                    </s-stack>
                  ))}
                </s-stack>
              )}
            </s-section>
          </s-stack>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
