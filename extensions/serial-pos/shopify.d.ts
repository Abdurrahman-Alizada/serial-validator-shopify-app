import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Action.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/MenuItem.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.product-details.action.menu-item.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/CartLineItem.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.home.tile.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/CartModal.jsx' {
  const shopify: import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/config.js' {
  const shopify: 
    import('@shopify/ui-extensions/pos.product-details.action.render').Api |
    import('@shopify/ui-extensions/pos.home.modal.render').Api;
  const globalThis: { shopify: typeof shopify };
}
