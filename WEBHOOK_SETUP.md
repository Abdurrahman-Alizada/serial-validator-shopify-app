# Webhook Setup for Serial Assignment

## Overview

This app uses Shopify webhooks to manage the serial number assignment lifecycle from cart to order completion.

## Serial Assignment Flow

### 1. **Cart/Checkout (POS)**
- Staff assigns serial numbers in POS
- Serials are marked as `RESERVED`
- `productId` and `variantId` are set
- `orderId` remains `null` (not linked to order yet)

### 2. **Order Created** → `orders/create` webhook
**File:** `app/routes/webhooks.orders.create.tsx`

When an order is created in Shopify:
- Finds all `RESERVED` serials for variants in the order
- Links serials to the order by setting `orderId`
- Status remains `RESERVED`

### 3. **Order Paid** → `orders/paid` webhook
**File:** `app/routes/webhooks.orders.paid.tsx`

When payment is completed:
- Finds all `RESERVED` serials with the `orderId`
- Marks them as `SOLD`
- Sets `soldAt` timestamp
- Records `customerId`

### 4. **Order Cancelled** → `orders/cancelled` webhook
**File:** `app/routes/webhooks.orders.cancelled.tsx`

When an order is cancelled:
- Finds serials linked to the `orderId`
- Releases them back to `AVAILABLE` status
- Clears `orderId`, `productId`, `variantId`

## Enabling Webhooks

### Development
Webhooks are **commented out by default** because they require protected customer data approval.

For development testing:
1. Serials will be RESERVED in POS ✅
2. OrderId won't be linked automatically ⚠️
3. Serials won't be marked as SOLD automatically ⚠️

### Production

#### Step 1: Request Protected Customer Data Access
1. Go to your [Shopify Partner Dashboard](https://partners.shopify.com/)
2. Select your app
3. Go to **API access** → **Protected customer data**
4. Fill out the form explaining why you need order data
5. Wait for Shopify approval (usually 1-2 business days)

#### Step 2: Enable Webhooks
Once approved, uncomment these lines in `shopify.app.toml`:

```toml
[[webhooks.subscriptions]]
topics = [ "orders/create" ]
uri = "/webhooks/orders/create"

[[webhooks.subscriptions]]
topics = [ "orders/paid" ]
uri = "/webhooks/orders/paid"

[[webhooks.subscriptions]]
topics = [ "orders/cancelled" ]
uri = "/webhooks/orders/cancelled"
```

#### Step 3: Deploy
1. Commit and push changes
2. Deploy to production (Railway/Heroku/etc.)
3. Webhooks will be automatically registered

## Testing Webhooks

### Local Testing (with ngrok/cloudflare tunnel)
```bash
# Start your dev server
npm run dev

# The tunnel URL will be used for webhook delivery
```

### Manual Testing
You can manually trigger webhook logic by:

1. Creating a test order in your dev store
2. Checking server logs for webhook processing
3. Verifying serial status in database

## Database Schema

```prisma
model Serial {
  id              String       @id @default(cuid())
  serialNumber    String       @unique
  productId       String?      // Set during cart assignment
  variantId       String?      // Set during cart assignment
  orderId         String?      // Set by orders/create webhook
  status          SerialStatus // AVAILABLE → RESERVED → SOLD
  soldAt          DateTime?    // Set by orders/paid webhook
  shop            String
}

enum SerialStatus {
  AVAILABLE  // Ready to be assigned
  RESERVED   // Assigned in cart, waiting for order
  SOLD       // Order paid and completed
  RETURNED   // Order refunded/returned
  DELETED    // Removed from system
}
```

## Troubleshooting

### Serials not linking to orders
- ✅ Check webhooks are uncommented in `shopify.app.toml`
- ✅ Verify app has protected customer data approval
- ✅ Check server logs for webhook processing
- ✅ Ensure variants have `requireSerial: true`

### Webhooks not receiving
- ✅ Check app is installed in store
- ✅ Verify webhook subscriptions in Partner Dashboard
- ✅ Check server is accessible from internet
- ✅ Review webhook delivery logs in Partner Dashboard

## Support

For webhook-related issues:
- [Shopify Webhook Documentation](https://shopify.dev/docs/apps/webhooks)
- [Protected Customer Data Guide](https://shopify.dev/docs/apps/launch/protected-customer-data)
