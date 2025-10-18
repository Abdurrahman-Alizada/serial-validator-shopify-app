import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
      return data({
        success: false,
        message: "Product ID is required"
      }, { status: 400, headers: corsHeaders });
    }

    // Extract numeric ID from Shopify GID if needed (e.g., "gid://shopify/Product/123456789" -> "123456789")
    // Or use the full GID if that's what's stored in shopifyId
    let searchId = productId;

    // Try to extract ID from GID format if present
    if (productId.includes('gid://shopify/Product/')) {
      searchId = productId.split('/').pop() || productId;
    }

    // Fetch product with all variants and available serials
    // Try multiple ID formats to ensure we find the product
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { shopifyId: productId },
          { shopifyId: searchId },
          { shopifyId: `gid://shopify/Product/${searchId}` }
        ]
      },
      include: {
        variants: {
          include: {
            serials: {
              where: { status: 'AVAILABLE' },
              orderBy: { serialNumber: 'asc' }
            },
            _count: {
              select: {
                serials: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return data({
        success: false,
        message: "Product not found"
      }, { status: 404, headers: corsHeaders });
    }

    // Get assigned serial for each variant
    const variantsWithAssignedSerial = await Promise.all(
      product.variants.map(async (variant) => {
        const assignedSerial = await prisma.serial.findFirst({
          where: {
            variantId: variant.id,
            status: { in: ["RESERVED", "SOLD"] }
          },
          select: {
            serialNumber: true,
            status: true,
            orderId: true
          }
        });

        return {
          ...variant,
          assignedSerial
        };
      })
    );

    const productWithAssignedSerials = {
      ...product,
      variants: variantsWithAssignedSerial
    };

    return data({
      success: true,
      message: "Product details fetched successfully",
      data: productWithAssignedSerials
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching product details:", error);
    return data({
      success: false,
      message: "Failed to fetch product details",
      error: String(error)
    }, { status: 500, headers: corsHeaders });
  }
};
