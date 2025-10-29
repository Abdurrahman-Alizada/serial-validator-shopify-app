import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { reserveSerialsForOrder } from "../db.server";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return data({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const { serialIds, productId, variantId, orderId, lineItemId } = await request.json();

    console.log('[API] Received request:', { serialIds, productId, variantId, lineItemId });

    if (!serialIds || !Array.isArray(serialIds) || serialIds.length === 0) {
      console.log('[API] Error: No serial IDs provided');
      return data({
        success: false,
        message: "At least one serial ID is required"
      }, { status: 400, headers: corsHeaders });
    }

    if (!productId || !variantId) {
      console.log('[API] Error: Missing product or variant ID');
      return data({
        success: false,
        message: "Product ID and Variant ID are required"
      }, { status: 400, headers: corsHeaders });
    }

    // The database stores shopifyId as just the numeric ID (e.g., '10424669667633')
    // not the full GID format (e.g., 'gid://shopify/Product/10424669667633')
    const shopifyProductId = String(productId);
    const shopifyVariantId = String(variantId);

    console.log('[API] Looking for product with shopifyId:', shopifyProductId);
    console.log('[API] Looking for variant with shopifyId:', shopifyVariantId);

    const product = await prisma.product.findFirst({
      where: {
        shopifyId: shopifyProductId
      },
      select: { id: true, title: true }
    });

    const variant = await prisma.productVariant.findFirst({
      where: {
        shopifyId: shopifyVariantId
      },
      select: { id: true, title: true }
    });

    console.log('[API] Found product:', product);
    console.log('[API] Found variant:', variant);

    if (!product || !variant) {
      console.log('[API] Error: Product or variant not found');
      return data({
        success: false,
        message: `Product or variant not found in database. Product: ${productId}, Variant: ${variantId}. Make sure to sync products first.`
      }, { status: 404, headers: corsHeaders });
    }

    console.log('[API] Reserving serials for product:', product.id, 'variant:', variant.id);

    // Verify that the serials are ASSIGNED to this product/variant
    const serialsToReserve = await prisma.serial.findMany({
      where: {
        id: { in: serialIds },
        productId: product.id,
        variantId: variant.id,
        status: "ASSIGNED"
      },
      select: { id: true }
    });

    if (serialsToReserve.length !== serialIds.length) {
      console.log('[API] Error: Some serials are not assigned to this product/variant');
      return data({
        success: false,
        message: "Some serials are not assigned to this product/variant or are already reserved"
      }, { status: 400, headers: corsHeaders });
    }

    // Change status from ASSIGNED to RESERVED for cart/checkout
    // The orderId will be assigned later when the order is actually placed via webhook
    const result = await reserveSerialsForOrder({
      serialIds,
      orderId: undefined, // Don't assign orderId yet - will be set after order placement
    });

    console.log('[API] Reservation result:', result);

    return data({
      success: true,
      message: `Successfully assigned ${serialIds.length} serial number${serialIds.length > 1 ? 's' : ''} to line item`,
      data: {
        assignedCount: result.count,
        lineItemId,
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error assigning serials to line item:", error);

    if (error instanceof Error) {
      return data({
        success: false,
        message: error.message
      }, { status: 400, headers: corsHeaders });
    }

    return data({
      success: false,
      message: "Internal server error"
    }, { status: 500, headers: corsHeaders });
  }
};
