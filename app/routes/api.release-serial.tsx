import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { serialNumber, orderId } = await request.json();

    if (!serialNumber) {
      return data({ 
        success: false, 
        message: "Serial number is required" 
      }, { status: 400 });
    }

    // Atomic release using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if serial exists and is reserved
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

      if (serial.status !== 'RESERVED') {
        throw new Error(`Serial number ${serialNumber} is not reserved (status: ${serial.status})`);
      }

      // Verify order ID if provided
      if (orderId && serial.orderId !== orderId) {
        throw new Error(`Serial number ${serialNumber} is not reserved for order ${orderId}`);
      }

      // Release the serial atomically
      const updatedSerial = await tx.serial.update({
        where: { serialNumber },
        data: {
          status: 'AVAILABLE',
          orderId: null,
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
      message: `Serial number ${serialNumber} released successfully`,
      data: {
        id: result.id,
        serialNumber: result.serialNumber,
        status: result.status,
        productTitle: result.product?.title || 'Unknown Product',
        variantTitle: result.variant?.title || 'Default Variant'
      }
    });

  } catch (error) {
    console.error("Error releasing serial:", error);
    
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