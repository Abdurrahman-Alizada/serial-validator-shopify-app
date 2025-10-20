import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { assignSerialsToVariant } from "../db.server";

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
  return data({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const { serialId, productId, variantId } = await request.json();

    if (!serialId || !productId || !variantId) {
      return data({
        success: false,
        message: "Serial ID, Product ID, and Variant ID are required"
      }, { status: 400, headers: corsHeaders });
    }

    const result = await assignSerialsToVariant({
      serialIds: [serialId],
      productId,
      variantId,
    });

    return data({
      success: true,
      message: `Serial number assigned successfully to variant`,
      data: result
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error assigning serial to variant:", error);

    if (error instanceof Error) {
      return data({
        success: false,
        message: error.message
      }, { status: 400, headers: corsHeaders });
    }

    return data({
      success: false,
      message: "Internal server error"
    }, { status: 500, headers: corsHeaders });
  }
};
