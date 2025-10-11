import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createBulkSerials } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File;

    if (!csvFile) {
      return Response.json(
        { success: false, message: "No file provided" },
        { status: 400 }
      );
    }

    // Read and parse CSV file
    const text = await csvFile.text();
    const lines = text.split('\n').filter(line => line.trim());
    const serialNumbers: string[] = [];

    // Parse serial numbers from CSV
    for (const line of lines) {
      if (line.includes(',')) {
        // Comma-separated values
        const rowSerials = line.split(',').map(s => s.trim()).filter(s => s);
        serialNumbers.push(...rowSerials);
      } else {
        // One per line
        const serial = line.trim();
        if (serial) {
          serialNumbers.push(serial);
        }
      }
    }

    // Remove duplicates
    const uniqueSerials = [...new Set(serialNumbers)];

    // Validate serial numbers
    const invalidSerials = uniqueSerials.filter(serial => 
      serial.length < 3 || serial.length > 50 || !/^[a-zA-Z0-9\-_]+$/.test(serial)
    );

    if (invalidSerials.length > 0) {
      return Response.json({
        success: false,
        message: `Found ${invalidSerials.length} invalid serial numbers`,
        invalidSerials: invalidSerials.slice(0, 10) // Return first 10 for debugging
      }, { status: 400 });
    }

    // Create bulk serials without assignment
    const result = await createBulkSerials({
      serialNumbers: uniqueSerials,
      shop: session.shop,
    });

    return Response.json({
      success: true,
      message: `Successfully imported ${result.count} serial numbers`,
      imported: result.count,
      skipped: uniqueSerials.length - result.count
    });

  } catch (error) {
    console.error("Bulk import error:", error);
    return Response.json(
      { success: false, message: "Failed to import serial numbers" },
      { status: 500 }
    );
  }
};