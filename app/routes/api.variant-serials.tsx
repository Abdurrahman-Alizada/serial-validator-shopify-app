import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const variantId = url.searchParams.get("variantId");

    if (!productId || !variantId) {
      return Response.json(
        { success: false, message: "Product ID and Variant ID are required" },
        { status: 400 }
      );
    }

    // Get all serials for this variant (all statuses)
    const serials = await prisma.serial.findMany({
      where: {
        productId,
        variantId,
        shop: session.shop
      },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        orderId: true,
        soldAt: true,
        createdAt: true
      },
      orderBy: [
        { status: 'asc' },
        { serialNumber: 'asc' }
      ]
    });

    return Response.json({
      success: true,
      serials: serials.map(s => ({
        id: s.id,
        serialNumber: s.serialNumber,
        status: s.status,
        orderId: s.orderId,
        soldAt: s.soldAt,
        createdAt: s.createdAt
      }))
    });

  } catch (error) {
    console.error("Error fetching variant serials:", error);
    return Response.json(
      { success: false, message: "Failed to fetch serials" },
      { status: 500 }
    );
  }
};
