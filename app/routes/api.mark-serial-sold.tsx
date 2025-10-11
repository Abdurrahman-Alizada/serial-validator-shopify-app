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

    // Atomic transaction to mark serial as sold
    const result = await prisma.$transaction(async (tx) => {
      // Find and verify serial
      const serial = await tx.serial.findUnique({
        where: { serialNumber },
        include: {
          product: true,
          variant: true
        }
      });

      if (!serial) {
        throw new Error(`Serial number ${serialNumber} not found`);
      }

      if (serial.status === 'SOLD') {
        throw new Error(`Serial number ${serialNumber} is already marked as sold`);
      }

      // Only allow marking as sold if it's AVAILABLE or RESERVED
      if (serial.status !== 'AVAILABLE' && serial.status !== 'RESERVED') {
        throw new Error(`Serial number ${serialNumber} cannot be sold (status: ${serial.status})`);
      }

      // If it's reserved, verify it's for the correct order
      if (serial.status === 'RESERVED' && orderId && serial.orderId !== orderId) {
        throw new Error(`Serial number ${serialNumber} is reserved for a different order`);
      }

      // Update serial status to sold
      const updatedSerial = await tx.serial.update({
        where: { serialNumber },
        data: { 
          status: 'SOLD',
          soldAt: new Date(),
          orderId: orderId || serial.orderId,
          updatedAt: new Date()
        },
        include: {
          product: true,
          variant: true
        }
      });

      return updatedSerial;
    });

    return data({
      success: true,
      message: `Serial number ${serialNumber} marked as sold`,
      data: {
        id: result.id,
        serialNumber: result.serialNumber,
        status: result.status,
        soldAt: result.soldAt,
        orderId: result.orderId,
        productTitle: result.product?.title || 'Unknown Product',
        variantTitle: result.variant?.title || 'Default Variant'
      }
    });

  } catch (error) {
    console.error("Error marking serial as sold:", error);
    
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