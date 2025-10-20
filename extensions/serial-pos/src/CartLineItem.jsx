import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<CartSerialCheckTile />, document.body);
};

function CartSerialCheckTile() {
  const [itemCount, setItemCount] = useState(0);
  const [serialRequired, setSerialRequired] = useState(false);

  useEffect(() => {
    try {
      // Subscribe to cart changes
      const unsubscribe = shopify.cart.current.subscribe((cart) => {
        if (cart && cart.lineItems) {
          setItemCount(cart.lineItems.length);
          // Check if any item requires serial
          const hasSerialRequired = cart.lineItems.some(item => {
            // For now, we'll just count items
            // Serial requirement check will happen in the modal
            return false;
          });
          setSerialRequired(hasSerialRequired);
        } else {
          setItemCount(0);
          setSerialRequired(false);
        }
      });

      // Initial load
      const initialCart = shopify.cart.current.value;
      if (initialCart && initialCart.lineItems) {
        setItemCount(initialCart.lineItems.length);
      }

      // Cleanup subscription on unmount
      return unsubscribe;
    } catch (error) {
      console.error('Error loading cart data:', error);
    }
  }, []);

  return (
    <s-tile
      heading="Cart Serial Check"
      subheading={itemCount > 0 ? `${itemCount} items in cart` : 'No items'}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
