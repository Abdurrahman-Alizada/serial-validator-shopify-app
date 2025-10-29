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

    if (!csvFile) {
      return data({
        success: false,
        message: "CSV file is required"
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

    // Parse CSV content - expecting 3 columns: Product Title, Variant Title (or NULL), Serial Number
    let records;

    try {
      records = parse(csvContent, {
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: false, // Enforce column count
        columns: false // Don't use first row as headers
      });
    } catch (csvError) {
      console.error('CSV parsing failed:', csvError);
      return data({
        success: false,
        message: "Invalid CSV format. Expected format: Product Title, Variant Title (or NULL), Serial Number"
      }, { status: 400 });
    }

    if (records.length === 0) {
      return data({
        success: false,
        message: "No records found in CSV"
      }, { status: 400 });
    }

    // Process records and build import data
    const importData: Array<{
      productTitle: string;
      variantTitle: string | null;
      serialNumber: string;
    }> = [];

    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      if (!Array.isArray(record) || record.length < 3) {
        errors.push(`Row ${i + 1}: Invalid format - expected 3 columns`);
        continue;
      }

      const productTitle = record[0]?.toString().trim();
      const variantTitle = record[1]?.toString().trim();
      const serialNumber = record[2]?.toString().trim();

      if (!productTitle) {
        errors.push(`Row ${i + 1}: Product title is required`);
        continue;
      }

      if (!serialNumber) {
        errors.push(`Row ${i + 1}: Serial number is required`);
        continue;
      }

      // Check if variant title is NULL or empty
      const finalVariantTitle = (!variantTitle || variantTitle.toUpperCase() === 'NULL') ? null : variantTitle;

      importData.push({
        productTitle,
        variantTitle: finalVariantTitle,
        serialNumber
      });
    }

    if (errors.length > 0 && importData.length === 0) {
      return data({
        success: false,
        message: `CSV validation failed: ${errors.join('; ')}`
      }, { status: 400 });
    }

    console.log(`Processing ${importData.length} serial numbers from CSV`);

    // Import serials in transaction
    const result = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      const skipped: string[] = [];
      const notFound: string[] = [];

      for (const item of importData) {
        // Look up product by title
        const product = await tx.product.findFirst({
          where: {
            title: {
              equals: item.productTitle,
              mode: 'insensitive'
            },
            shop: session.shop
          },
          include: {
            variants: true
          }
        });

        if (!product) {
          notFound.push(`Product "${item.productTitle}" not found`);
          continue;
        }

        // Look up variant if specified
        let variantId: string | null = null;
        if (item.variantTitle) {
          const variant = product.variants.find(v =>
            v.title.toLowerCase() === item.variantTitle!.toLowerCase()
          );

          if (!variant) {
            notFound.push(`Variant "${item.variantTitle}" not found for product "${item.productTitle}"`);
            continue;
          }

          variantId = variant.id;
        } else {
          // If no variant specified, use the first/default variant
          if (product.variants.length > 0) {
            variantId = product.variants[0].id;
          }
        }

        // Check if serial number already exists
        const existingSerial = await tx.serial.findUnique({
          where: { serialNumber: item.serialNumber }
        });

        if (existingSerial) {
          skipped.push(item.serialNumber);
          continue;
        }

        // Create serial with AVAILABLE status
        await tx.serial.create({
          data: {
            serialNumber: item.serialNumber,
            productId: product.id,
            variantId: variantId,
            status: 'AVAILABLE',
            shop: session.shop
          }
        });

        created.push(item.serialNumber);
      }

      return {
        created: created.length,
        skipped: skipped.length,
        notFound: notFound.length,
        total: importData.length,
        errors: notFound.length > 0 ? notFound.slice(0, 10) : [], // Return first 10 errors
        validationErrors: errors.length > 0 ? errors.slice(0, 10) : []
      };
    });

    const message = result.created > 0
      ? `Successfully imported ${result.created} serial numbers. ${result.skipped > 0 ? `Skipped ${result.skipped} duplicates.` : ''} ${result.notFound > 0 ? `${result.notFound} items not found.` : ''}`
      : `No serials imported. ${result.skipped > 0 ? `${result.skipped} duplicates found.` : ''} ${result.notFound > 0 ? `${result.notFound} items not found.` : ''}`;

    return data({
      success: result.created > 0,
      message,
      data: {
        created: result.created,
        skipped: result.skipped,
        notFound: result.notFound,
        total: result.total,
        errors: result.errors,
        validationErrors: result.validationErrors
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