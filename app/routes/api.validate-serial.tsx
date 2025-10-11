import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { serialNumber, productId, variantId } = await request.json();

    if (!serialNumber) {
      return data({ 
        success: false, 
        message: "Serial number is required" 
      }, { status: 400 });
    }

    // Find the serial number in database
    const serial = await prisma.serial.findUnique({
      where: { serialNumber },
      include: {
        product: true,
        variant: true
      }
    });

    if (!serial) {
      return data({
        success: false,
        message: `Serial number ${serialNumber} not found`
      });
    }

    // Check if serial is already sold
    if (serial.status === 'SOLD') {
      return data({
        success: false,
        message: `Serial number ${serialNumber} has already been sold`
      });
    }

    // Check if serial is reserved
    if (serial.status === 'RESERVED') {
      return data({
        success: false,
        message: `Serial number ${serialNumber} is currently reserved`
      });
    }

    // Check if serial is for the correct product (if productId provided)
    if (productId && serial.productId !== productId) {
      return data({
        success: false,
        message: `Serial number ${serialNumber} is not for this product`
      });
    }

    // Check if serial is for the correct variant (if variantId provided)
    if (variantId && serial.variantId !== variantId) {
      return data({
        success: false,
        message: `Serial number ${serialNumber} is not for this variant`
      });
    }

    // Serial is valid and available
    return data({
      success: true,
      message: `Serial number ${serialNumber} is valid and available`,
      data: {
        id: serial.id,
        serialNumber: serial.serialNumber,
        status: serial.status,
        productTitle: serial.product?.title || 'Unknown Product',
        variantTitle: serial.variant?.title || 'Default Variant',
        productId: serial.productId,
        variantId: serial.variantId
      }
    });

  } catch (error) {
    console.error("Error validating serial:", error);
    return data({ 
      success: false, 
      message: "Internal server error" 
    }, { status: 500 });
  }
};