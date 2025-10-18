import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE_URL = 'https://traveling-enb-yacht-rider.trycloudflare.com';

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/products`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProducts(data.data || []);
        } else {
          setError(data.message);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <s-page heading='POS action'>
      <s-scroll-box>
        <s-box padding="small">
          <s-stack direction="block" gap="base">
            <s-text>Welcome to the preact action extension</s-text>

            <s-section heading="Products">
              {loading && <s-text>Loading products...</s-text>}

              {error && (
                <s-banner tone="critical">
                  Error: {error}
                </s-banner>
              )}

              {!loading && !error && products.length === 0 && (
                <s-text>No products found</s-text>
              )}

              {!loading && !error && products.length > 0 && (
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
