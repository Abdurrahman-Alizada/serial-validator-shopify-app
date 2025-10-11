import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { variantId, serialNumber, orderId } = await request.json();

    if (!variantId || !serialNumber) {
      return data({ 
        success: false, 
        message: "Variant ID and serial number are required" 
      }, { status: 400 });
    }

    // Atomic assignment using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if serial exists and is available
      const serial = await tx.serial.findUnique({
        where: { serialNumber },
        include: {
          variant: true,
          product: true
        }
      });

      if (!serial) {
        throw new Error(`Serial number ${serialNumber} not found`);
      }

      if (serial.status !== 'AVAILABLE') {
        throw new Error(`Serial number ${serialNumber} is not available (status: ${serial.status})`);
      }

      if (serial.variantId !== variantId) {
        throw new Error(`Serial number ${serialNumber} does not belong to this variant`);
      }

      // Reserve the serial atomically
      const updatedSerial = await tx.serial.update({
        where: { serialNumber },
        data: {
          status: 'RESERVED',
          orderId: orderId || null,
          updatedAt: new Date()
        },
        include: {
          variant: true,
          product: true
        }
      });

      return updatedSerial;
    });

    return data({
      success: true,
      message: `Serial number ${serialNumber} reserved successfully`,
      data: {
        id: result.id,
        serialNumber: result.serialNumber,
        status: result.status,
        orderId: result.orderId,
        productTitle: result.product?.title || 'Unknown Product',
        variantTitle: result.variant?.title || 'Default Variant'
      }
    });

  } catch (error) {
    console.error("Error assigning serial:", error);
    
    if (error instanceof Error) {
      return data({ 
        success: false, 
        message: error.message 
      }, { status: 400 });
    }

    return data({ 
      success: false, 
      message: "Internal server error" 
    }, { status: 500 });
  }
};