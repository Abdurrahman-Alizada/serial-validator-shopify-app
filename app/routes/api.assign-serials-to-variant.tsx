import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { assignSerialsToVariant } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const serialIds = JSON.parse(formData.get("serialIds") as string);
    const productId = formData.get("productId") as string;
    const variantId = formData.get("variantId") as string;

    if (!serialIds || !Array.isArray(serialIds) || !productId || !variantId) {
      return Response.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await assignSerialsToVariant({
      serialIds,
      productId,
      variantId,
    });

    return Response.json({
      success: true,
      message: `Successfully assigned ${result.count} serial numbers to variant`,
      assigned: result.count
    });

  } catch (error) {
    console.error("Serial assignment error:", error);
    return Response.json(
      { success: false, message: "Failed to assign serial numbers" },
      { status: 500 }
    );
  }
};