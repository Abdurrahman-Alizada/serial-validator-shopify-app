import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    const variantId = url.searchParams.get("variantId");

    // Get all serials for this shop
    const allSerials = await prisma.serial.findMany({
      where: { shop: session.shop },
      include: {
        product: {
          select: { id: true, shopifyId: true, title: true }
        },
        variant: {
          select: { id: true, shopifyId: true, title: true }
        }
      },
      take: 50
    });

    // Get the specific product and variant
    const product = productId ? await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, shopifyId: true, title: true }
    }) : null;

    const variant = variantId ? await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, shopifyId: true, title: true, productId: true }
    }) : null;

    // Get serials for this specific product/variant
    const matchingSerials = productId && variantId ? await prisma.serial.findMany({
      where: {
        productId,
        variantId,
        shop: session.shop
      }
    }) : [];

    return Response.json({
      success: true,
      data: {
        shop: session.shop,
        requestedProductId: productId,
        requestedVariantId: variantId,
        product,
        variant,
        totalSerials: allSerials.length,
        matchingSerials: matchingSerials.length,
        allSerials: allSerials.slice(0, 10), // First 10 for debugging
        matchingSerialsData: matchingSerials
      }
    });

  } catch (error) {
    console.error("Debug error:", error);
    return Response.json(
      { success: false, message: "Debug failed", error: String(error) },
      { status: 500 }
    );
  }
};
