import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getAssignedSerialsForVariant } from "../db.server";
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
    const shop = url.searchParams.get("shop");
    const productId = url.searchParams.get("productId");
    const variantId = url.searchParams.get("variantId");

    if (!shop) {
      return data({
        success: false,
        message: "Shop parameter is required"
      }, { status: 400, headers: corsHeaders });
    }

    // If productId and variantId are provided, return ASSIGNED serials for that specific variant
    if (productId && variantId) {
      const assignedSerials = await getAssignedSerialsForVariant({
        productId,
        variantId,
        shop
      });

      return data({
        success: true,
        message: "Assigned serials fetched successfully",
        count: assignedSerials.length,
        data: assignedSerials
      }, { headers: corsHeaders });
    }

    // Otherwise, return all ASSIGNED serials for the shop (for backward compatibility)
    const allAssignedSerials = await prisma.serial.findMany({
      where: {
        shop,
        status: "ASSIGNED"
      },
      orderBy: { serialNumber: 'asc' }
    });

    return data({
      success: true,
      message: "Assigned serials fetched successfully",
      count: allAssignedSerials.length,
      data: allAssignedSerials
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching serials:", error);
    return data({
      success: false,
      message: "Failed to fetch serials",
      error: String(error)
    }, { status: 500, headers: corsHeaders });
  }
};
