import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  try {
    const url = new URL(request.url);
    const variantId = url.searchParams.get("variantId");
    const productId = url.searchParams.get("productId");
    const status = url.searchParams.get("status");
    const format = url.searchParams.get("format") || "csv";

    // Build where clause
    const where: any = {
      shop: session.shop
    };

    if (variantId) {
      where.variantId = variantId;
    }

    if (productId) {
      where.productId = productId;
    }

    if (status) {
      where.status = status;
    }

    // Fetch serials
    const serials = await prisma.serial.findMany({
      where,
      include: {
        product: {
          select: {
            title: true,
            handle: true
          }
        },
        variant: {
          select: {
            title: true,
            sku: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (format === "json") {
      return Response.json({
        success: true,
        data: serials,
        count: serials.length
      });
    }

    // CSV format
    const csvHeaders = [
      "Serial Number",
      "Status", 
      "Product Title",
      "Variant Title",
      "SKU",
      "Order ID",
      "Sold At",
      "Created At"
    ];

    const csvRows = serials.map(serial => [
      serial.serialNumber,
      serial.status,
      serial.product?.title || '',
      serial.variant?.title || '',
      serial.variant?.sku || '',
      serial.orderId || '',
      serial.soldAt ? serial.soldAt.toISOString() : '',
      serial.createdAt.toISOString()
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => 
        // Escape fields containing commas or quotes
        field.toString().includes(',') || field.toString().includes('"') 
          ? `"${field.toString().replace(/"/g, '""')}"` 
          : field.toString()
      ).join(','))
    ].join('\n');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `serials-export-${timestamp}.csv`;

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (error) {
    console.error("Error exporting serials:", error);
    return Response.json({ 
      success: false, 
      message: "Export failed" 
    }, { status: 500 });
  }
};