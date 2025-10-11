import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { parse } from "csv-parse/sync";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const csvFile = formData.get("csvFile") as File;
    const variantId = formData.get("variantId") as string;
    const productId = formData.get("productId") as string;

    if (!csvFile) {
      return data({ 
        success: false, 
        message: "CSV file is required" 
      }, { status: 400 });
    }

    if (!variantId || !productId) {
      return data({ 
        success: false, 
        message: "Variant ID and Product ID are required" 
      }, { status: 400 });
    }

    // Read CSV content
    const csvContent = await csvFile.text();
    
    if (!csvContent.trim()) {
      return data({ 
        success: false, 
        message: "CSV file is empty" 
      }, { status: 400 });
    }

    // Parse CSV content using csv-parse library
    let records;
    const serialNumbers: string[] = [];
    
    try {
      // Try parsing as proper CSV first
      records = parse(csvContent, {
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true
      });
      
      // Extract serial numbers from records
      for (const record of records) {
        if (Array.isArray(record)) {
          // Multiple columns - take all non-empty values as serials
          for (const value of record) {
            const serial = value?.toString().trim();
            if (serial) {
              serialNumbers.push(serial);
            }
          }
        } else {
          // Single column
          const serial = record?.toString().trim();
          if (serial) {
            serialNumbers.push(serial);
          }
        }
      }
    } catch (csvError) {
      // If CSV parsing fails, fall back to simple line-by-line parsing
      console.log('CSV parsing failed, falling back to simple parsing:', csvError);
      const lines = csvContent.split('\n').filter(line => line.trim());
      
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
    }

    if (serialNumbers.length === 0) {
      return data({ 
        success: false, 
        message: "No valid serial numbers found in CSV" 
      }, { status: 400 });
    }

    // Remove duplicates
    const uniqueSerials = [...new Set(serialNumbers)];

    console.log(`Importing ${uniqueSerials.length} serial numbers for variant ${variantId}`);

    // Import serials in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check for existing serials
      const existingSerials = await tx.serial.findMany({
        where: {
          serialNumber: {
            in: uniqueSerials
          }
        },
        select: {
          serialNumber: true
        }
      });

      const existingNumbers = existingSerials.map(s => s.serialNumber);
      const newSerials = uniqueSerials.filter(sn => !existingNumbers.includes(sn));

      if (newSerials.length === 0) {
        throw new Error("All serial numbers already exist in the database");
      }

      // Create new serials
      const createData = newSerials.map(serialNumber => ({
        serialNumber,
        productId,
        variantId,
        status: 'AVAILABLE' as const,
        shop: session.shop,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      const createResult = await tx.serial.createMany({
        data: createData
      });

      return {
        created: createResult.count,
        duplicates: existingNumbers.length,
        total: uniqueSerials.length
      };
    });

    return data({
      success: true,
      message: `Successfully imported ${result.created} serial numbers`,
      data: {
        created: result.created,
        duplicates: result.duplicates,
        total: result.total,
        variantId,
        productId
      }
    });

  } catch (error) {
    console.error("Error importing serials:", error);
    
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