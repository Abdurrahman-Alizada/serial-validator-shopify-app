import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { payload } = await authenticate.webhook(request);

    if (!payload) {
      return data({ success: false, message: "No payload received" }, { status: 400 });
    }

    const order = payload as any;
    const orderId = order.id?.toString();
    const shop = order.shop_id || order.shop_domain;
    const lineItems = order.line_items || [];

    if (!orderId || !shop) {
      console.error("Missing order ID or shop in webhook payload");
      return data({ success: false, message: "Invalid payload" }, { status: 400 });
    }

    console.log(`Processing order create webhook for order ${orderId}`);
    console.log(`Line items:`, lineItems.length);

    // For each line item, find reserved serials and link them to this order
    let totalAssigned = 0;

    for (const lineItem of lineItems) {
      const variantId = lineItem.variant_id?.toString();
      const quantity = lineItem.quantity || 1;

      if (!variantId) continue;

      console.log(`Processing line item: variant ${variantId}, quantity ${quantity}`);

      // Find the variant in our database
      const variant = await prisma.productVariant.findFirst({
        where: { shopifyId: variantId },
        select: { id: true, requireSerial: true }
      });

      if (!variant || !variant.requireSerial) {
        console.log(`Variant ${variantId} doesn't require serial or not found`);
        continue;
      }

      // Find reserved serials for this variant that don't have an orderId yet
      const reservedSerials = await prisma.serial.findMany({
        where: {
          variantId: variant.id,
          status: 'RESERVED',
          orderId: null, // Only get serials without an order
          shop: shop
        },
        take: quantity,
        orderBy: { updatedAt: 'desc' } // Get most recently reserved
      });

      if (reservedSerials.length > 0) {
        // Assign orderId to these serials
        const serialIds = reservedSerials.map(s => s.id);

        await prisma.serial.updateMany({
          where: {
            id: { in: serialIds }
          },
          data: {
            orderId: orderId,
            updatedAt: new Date()
          }
        });

        totalAssigned += reservedSerials.length;
        console.log(`Assigned ${reservedSerials.length} serials to order ${orderId} for variant ${variantId}`);
      } else {
        console.log(`No reserved serials available for variant ${variantId}`);
      }
    }

    return data({
      success: true,
      message: `Order ${orderId} created: ${totalAssigned} serials linked`,
      data: {
        orderId,
        serialsLinked: totalAssigned
      }
    });

  } catch (error) {
    console.error("Error processing order create webhook:", error);
    return data({
      success: false,
      message: "Webhook processing failed"
    }, { status: 500 });
  }
};
