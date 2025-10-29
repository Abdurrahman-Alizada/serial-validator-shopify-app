import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getAvailableSerialsForVariant } from "../db.server";

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

    // Get available serials for this variant
    const serials = await getAvailableSerialsForVariant({
      productId,
      variantId,
      shop: session.shop,
      status: "AVAILABLE"
    });

    return Response.json({
      success: true,
      serials: serials.map(s => ({
        id: s.id,
        serialNumber: s.serialNumber
      }))
    });

  } catch (error) {
    console.error("Error fetching available serials:", error);
    return Response.json(
      { success: false, message: "Failed to fetch serials" },
      { status: 500 }
    );
  }
};
