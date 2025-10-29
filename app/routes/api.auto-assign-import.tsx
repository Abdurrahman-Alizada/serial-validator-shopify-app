import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { createSerial } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const dataString = formData.get("data") as string;

    if (!dataString) {
      return Response.json(
        { success: false, message: "No data provided" },
        { status: 400 }
      );
    }

    const { serials } = JSON.parse(dataString);

    if (!Array.isArray(serials) || serials.length === 0) {
      return Response.json(
        { success: false, message: "Invalid data format" },
        { status: 400 }
      );
    }

    // Validate all serials have required fields
    const invalidSerials = serials.filter(
      s => !s.serialNumber || !s.productId || !s.variantId
    );

    if (invalidSerials.length > 0) {
      return Response.json(
        {
          success: false,
          message: `${invalidSerials.length} serial(s) missing required fields`
        },
        { status: 400 }
      );
    }

    // Import serials with assignments
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const serial of serials) {
      try {
        // Check if serial already exists
        const existingSerial = await prisma.serial.findFirst({
          where: {
            serialNumber: serial.serialNumber,
            shop: session.shop,
          },
        });

        if (existingSerial) {
          skipped++;
          errors.push(`Serial ${serial.serialNumber} already exists`);
          continue;
        }

        // Verify product exists
        const product = await prisma.product.findFirst({
          where: {
            id: serial.productId,
            shop: session.shop,
          },
        });

        if (!product) {
          skipped++;
          errors.push(`Product not found for serial ${serial.serialNumber}`);
          continue;
        }

        // Verify variant exists
        const variant = await prisma.productVariant.findFirst({
          where: {
            id: serial.variantId,
            productId: serial.productId,
          },
        });

        if (!variant) {
          skipped++;
          errors.push(`Variant not found for serial ${serial.serialNumber}`);
          continue;
        }

        // Create serial with assignment
        await createSerial({
          serialNumber: serial.serialNumber,
          productId: serial.productId,
          variantId: serial.variantId,
          shop: session.shop,
        });

        imported++;
      } catch (error) {
        console.error(`Error importing serial ${serial.serialNumber}:`, error);
        skipped++;
        errors.push(`Failed to import ${serial.serialNumber}`);
      }
    }

    return Response.json({
      success: true,
      message: `Successfully imported ${imported} serial number${imported !== 1 ? 's' : ''} with automatic assignment`,
      imported,
      skipped,
      errors: errors.slice(0, 10), // Return first 10 errors
      totalErrors: errors.length,
    });

  } catch (error) {
    console.error("Auto-assign import error:", error);
    return Response.json(
      { success: false, message: "Failed to import serial numbers" },
      { status: 500 }
    );
  }
};
