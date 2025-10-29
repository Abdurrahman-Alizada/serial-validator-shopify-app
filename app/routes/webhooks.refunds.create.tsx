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

    const refund = payload as any;
    const orderId = refund.order_id?.toString();
    const refundLineItems = refund.refund_line_items || [];
    const shop = refund.shop_id || refund.shop_domain;

    if (!orderId || !shop) {
      console.error("Missing order ID or shop in refund webhook payload");
      return data({ success: false, message: "Invalid payload" }, { status: 400 });
    }

    console.log(`Processing refund webhook for order ${orderId}`);

    // If no specific line items, assume full refund
    if (refundLineItems.length === 0) {
      const updateResult = await prisma.$transaction(async (tx) => {
        // Find all sold serials for this order
        const soldSerials = await tx.serial.findMany({
          where: {
            orderId: orderId,
            status: 'SOLD',
            shop: shop
          }
        });

        if (soldSerials.length === 0) {
          return { count: 0, serials: [] };
        }

        const result = await tx.serial.updateMany({
          where: {
            orderId: orderId,
            status: 'SOLD',
            shop: shop
          },
          data: {
            status: 'ASSIGNED',
            orderId: null,
            soldAt: null,
            updatedAt: new Date()
          }
        });


        console.log(`Marked ${result.count} serials back to ASSIGNED status for full refund of order ${orderId}`);
        return { count: result.count, serials: soldSerials };
      });

      return data({
        success: true,
        message: `Full refund processed for order ${orderId}: ${updateResult.count} serials marked as returned`
      });
    }

    // For partial refunds, we'd need to match line items to serials
    // This would require additional logic to map Shopify line items to our serials
    // For now, we'll log this case
    console.log(`Partial refund detected for order ${orderId} - manual review may be needed`);

    return data({
      success: true,
      message: `Partial refund processed for order ${orderId} - review serial status manually`
    });

  } catch (error) {
    console.error("Error processing refund webhook:", error);
    return data({ 
      success: false, 
      message: "Webhook processing failed" 
    }, { status: 500 });
  }
};