import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { serialNumbers, orderId } = await request.json();

    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      return data({ 
        success: false, 
        message: "Serial numbers array is required" 
      }, { status: 400 });
    }

    // Atomic bulk update using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Verify all serials are valid and available/reserved
      const serials = await tx.serial.findMany({
        where: {
          serialNumber: {
            in: serialNumbers
          }
        },
        include: {
          product: true,
          variant: true
        }
      });

      const foundNumbers = serials.map(s => s.serialNumber);
      const notFound = serialNumbers.filter(sn => !foundNumbers.includes(sn));
      
      if (notFound.length > 0) {
        throw new Error(`Serial numbers not found: ${notFound.join(', ')}`);
      }

      // Check status of all serials
      const invalidSerials = serials.filter(s => 
        s.status !== 'AVAILABLE' && s.status !== 'RESERVED'
      );
      
      if (invalidSerials.length > 0) {
        throw new Error(`Cannot sell serials with status: ${invalidSerials.map(s => `${s.serialNumber} (${s.status})`).join(', ')}`);
      }

      // Check reserved serials belong to correct order
      if (orderId) {
        const wrongOrderSerials = serials.filter(s => 
          s.status === 'RESERVED' && s.orderId && s.orderId !== orderId
        );
        
        if (wrongOrderSerials.length > 0) {
          throw new Error(`Reserved serials belong to different orders: ${wrongOrderSerials.map(s => s.serialNumber).join(', ')}`);
        }
      }

      // Update all valid serials to sold status
      const updateResult = await tx.serial.updateMany({
        where: {
          serialNumber: {
            in: serialNumbers
          },
          status: {
            in: ['AVAILABLE', 'RESERVED']
          }
        },
        data: {
          status: 'SOLD',
          soldAt: new Date(),
          orderId: orderId || undefined,
          updatedAt: new Date()
        }
      });

      // Get the updated serials for response
      const updatedSerials = await tx.serial.findMany({
        where: {
          serialNumber: {
            in: serialNumbers
          },
          status: 'SOLD'
        },
        include: {
          product: true,
          variant: true
        }
      });

      return { updateResult, updatedSerials };
    });

    return data({
      success: true,
      message: `${result.updateResult.count} serial numbers marked as sold`,
      data: {
        updatedCount: result.updateResult.count,
        serials: result.updatedSerials.map(serial => ({
          id: serial.id,
          serialNumber: serial.serialNumber,
          status: serial.status,
          soldAt: serial.soldAt,
          orderId: serial.orderId,
          productTitle: serial.product?.title || 'Unknown Product',
          variantTitle: serial.variant?.title || 'Default Variant'
        }))
      }
    });

  } catch (error) {
    console.error("Error bulk marking serials as sold:", error);
    
    if (error instanceof Error) {
      return data({ 
        success: false, 
        message: error.message 
      }, { status: 400 });
    }

    return data({ 
      success: false, 
      message: "Internal server error" 
    }, { status: 500 });
  }
};