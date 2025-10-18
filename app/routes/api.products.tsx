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
    const products = await prisma.product.findMany({
      include: {
        variants: {
          include: {
            _count: {
              select: {
                serials: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return data({
      success: true,
      message: "Products fetched successfully",
      count: products.length,
      data: products
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching products:", error);
    return data({
      success: false,
      message: "Failed to fetch products",
      error: String(error)
    }, { status: 500, headers: corsHeaders });
  }
};
