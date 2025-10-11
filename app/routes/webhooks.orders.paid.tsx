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
    const customerId = order.customer?.id?.toString();

    if (!orderId || !shop) {
      console.error("Missing order ID or shop in webhook payload");
      return data({ success: false, message: "Invalid payload" }, { status: 400 });
    }

    console.log(`Processing order paid webhook for order ${orderId}`);

    // Mark reserved serials for this order as sold
    const updateResult = await prisma.$transaction(async (tx) => {
      // Find all reserved serials for this order
      const reservedSerials = await tx.serial.findMany({
        where: {
          orderId: orderId,
          status: 'RESERVED',
          shop: shop
        }
      });

      if (reservedSerials.length === 0) {
        console.log(`No reserved serials found for order ${orderId}`);
        return { count: 0, serials: [] };
      }

      // Mark them as sold
      const result = await tx.serial.updateMany({
        where: {
          orderId: orderId,
          status: 'RESERVED',
          shop: shop
        },
        data: {
          status: 'SOLD',
          soldAt: new Date(),
          customerId: customerId,
          updatedAt: new Date()
        }
      });


      console.log(`Marked ${result.count} serials as sold for order ${orderId}`);
      return { count: result.count, serials: reservedSerials };
    });

    return data({
      success: true,
      message: `Order ${orderId} processed: ${updateResult.count} serials marked as sold`,
      data: {
        orderId,
        serialsProcessed: updateResult.count,
        customerId
      }
    });

  } catch (error) {
    console.error("Error processing order paid webhook:", error);
    return data({ 
      success: false, 
      message: "Webhook processing failed" 
    }, { status: 500 });
  }
};