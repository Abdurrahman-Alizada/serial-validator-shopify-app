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

    if (!orderId || !shop) {
      console.error("Missing order ID or shop in webhook payload");
      return data({ success: false, message: "Invalid payload" }, { status: 400 });
    }

    console.log(`Processing order cancelled webhook for order ${orderId}`);

    // Release all serials for this order back to available
    const updateResult = await prisma.$transaction(async (tx) => {
      // Find all serials for this order (both reserved and sold)
      const orderSerials = await tx.serial.findMany({
        where: {
          orderId: orderId,
          status: {
            in: ['RESERVED', 'SOLD']
          },
          shop: shop
        }
      });

      if (orderSerials.length === 0) {
        console.log(`No serials found for cancelled order ${orderId}`);
        return { count: 0, serials: [] };
      }

      // Mark them as available
      const result = await tx.serial.updateMany({
        where: {
          orderId: orderId,
          status: {
            in: ['RESERVED', 'SOLD']
          },
          shop: shop
        },
        data: {
          status: 'AVAILABLE',
          orderId: null,
          customerId: null,
          soldAt: null,
          reservedAt: null,
          reservedUntil: null,
          returnedAt: null,
          updatedAt: new Date()
        }
      });


      console.log(`Released ${result.count} serials for cancelled order ${orderId}`);
      return { count: result.count, serials: orderSerials };
    });

    return data({
      success: true,
      message: `Order ${orderId} cancelled: ${updateResult.count} serials released`
    });

  } catch (error) {
    console.error("Error processing order cancelled webhook:", error);
    return data({ 
      success: false, 
      message: "Webhook processing failed" 
    }, { status: 500 });
  }
};