import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/OrderIndexBanner.jsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-index.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/OrderStatusBlock.jsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/api.js' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/config.js' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.order-index.block.render').Api
    | import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
