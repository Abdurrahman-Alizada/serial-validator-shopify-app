import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getUnassignedSerials } from "../db.server";

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

    if (!shop) {
      return data({
        success: false,
        message: "Shop parameter is required"
      }, { status: 400, headers: corsHeaders });
    }

    const unassignedSerials = await getUnassignedSerials(shop);

    return data({
      success: true,
      message: "Unassigned serials fetched successfully",
      count: unassignedSerials.length,
      data: unassignedSerials
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching unassigned serials:", error);
    return data({
      success: false,
      message: "Failed to fetch unassigned serials",
      error: String(error)
    }, { status: 500, headers: corsHeaders });
  }
};
