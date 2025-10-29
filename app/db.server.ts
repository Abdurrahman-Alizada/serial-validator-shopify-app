import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

// Serial number operations
export async function createSerial({
  serialNumber,
  productId,
  variantId,
  shop,
}: {
  serialNumber: string;
  productId?: string;
  variantId?: string;
  shop: string;
}) {
  return await prisma.serial.create({
    data: {
      serialNumber,
      productId,
      variantId,
      shop,
      status: "AVAILABLE",
    },
  });
}

export async function createBulkSerials({
  serialNumbers,
  shop,
}: {
  serialNumbers: string[];
  shop: string;
}) {
  return await prisma.serial.createMany({
    data: serialNumbers.map(serialNumber => ({
      serialNumber,
      shop,
      status: "AVAILABLE" as const,
    })),
    skipDuplicates: true,
  });
}

export async function getSerials(shop: string) {
  return await prisma.serial.findMany({
    where: { shop },
    include: {
      product: true,
      variant: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUnassignedSerials(shop: string) {
  return await prisma.serial.findMany({
    where: { 
      shop,
      productId: null,
      variantId: null,
      status: "AVAILABLE"
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateSerialStatus({
  id,
  status,
}: {
  id: string;
  status: "AVAILABLE" | "ASSIGNED" | "RESERVED" | "SOLD" | "RETURNED" | "DELETED";
}) {
  return await prisma.serial.update({
    where: { id },
    data: { status },
  });
}

export async function updateSerial({
  id,
  serialNumber,
  productId,
  variantId,
}: {
  id: string;
  serialNumber?: string;
  productId?: string | null;
  variantId?: string | null;
}) {
  return await prisma.serial.update({
    where: { id },
    data: {
      ...(serialNumber !== undefined && { serialNumber }),
      ...(productId !== undefined && { productId }),
      ...(variantId !== undefined && { variantId }),
    },
  });
}

export async function deleteSerial(id: string) {
  return await prisma.serial.delete({
    where: { id },
  });
}

export async function assignSerialsToVariant({
  serialIds,
  productId,
  variantId,
}: {
  serialIds: string[];
  productId: string;
  variantId: string;
}) {
  // Allow multiple serials for the same variant
  if (serialIds.length === 0) {
    throw new Error("At least one serial number must be provided");
  }

  // Validate that serials are AVAILABLE and either:
  // 1. Already belong to this product/variant, OR
  // 2. Are unassigned (no productId/variantId)
  const serials = await prisma.serial.findMany({
    where: {
      id: { in: serialIds },
      status: "AVAILABLE",
      OR: [
        {
          productId,
          variantId,
        },
        {
          productId: null,
          variantId: null,
        }
      ]
    },
    select: { id: true, serialNumber: true, productId: true, variantId: true }
  });

  if (serials.length !== serialIds.length) {
    throw new Error("Some serials are not available, already assigned to another product, or in use");
  }

  // Update serials to be assigned to this product/variant
  // This will set productId/variantId for unassigned serials
  // AND change status from AVAILABLE to ASSIGNED
  return await prisma.serial.updateMany({
    where: {
      id: { in: serialIds },
    },
    data: {
      productId,
      variantId,
      status: "ASSIGNED",
    },
  });
}

export async function releaseSerialsFromVariant({
  serialIds,
}: {
  serialIds: string[];
}) {
  return await prisma.serial.updateMany({
    where: {
      id: { in: serialIds },
      status: { in: ["RESERVED", "ASSIGNED", "AVAILABLE"] }
    },
    data: {
      productId: null,
      variantId: null,
      status: "AVAILABLE",
    },
  });
}

export async function getAvailableSerialsForVariant({
  productId,
  variantId,
  shop,
  status = "AVAILABLE"
}: {
  productId: string;
  variantId: string;
  shop: string;
  status?: string;
}) {
  // Get serials that are either:
  // 1. Already assigned to this specific product/variant with AVAILABLE status
  // 2. Unassigned (no productId/variantId) with AVAILABLE status
  return await prisma.serial.findMany({
    where: {
      shop,
      status,
      OR: [
        {
          // Already assigned to this product/variant
          productId,
          variantId,
        },
        {
          // Unassigned serials
          productId: null,
          variantId: null,
        }
      ]
    },
    orderBy: { serialNumber: 'asc' }
  });
}

export async function getAssignedSerialsForVariant({
  productId,
  variantId,
  shop
}: {
  productId: string;
  variantId: string;
  shop: string;
}) {
  return await prisma.serial.findMany({
    where: {
      productId,
      variantId,
      shop,
      status: "ASSIGNED"
    },
    orderBy: { serialNumber: 'asc' }
  });
}

export async function reserveSerialsForOrder({
  serialIds,
  orderId,
}: {
  serialIds: string[];
  orderId?: string;
}) {
  // Check if serials are ASSIGNED status
  const serials = await prisma.serial.findMany({
    where: {
      id: { in: serialIds },
      status: "ASSIGNED"
    },
    select: { id: true, serialNumber: true }
  });

  if (serials.length !== serialIds.length) {
    throw new Error("Some serials are not in ASSIGNED status");
  }

  // Change status from ASSIGNED to RESERVED
  return await prisma.serial.updateMany({
    where: {
      id: { in: serialIds },
    },
    data: {
      status: "RESERVED",
      orderId: orderId || null,
    },
  });
}

// Product operations
export async function syncProduct({
  shopifyId,
  title,
  handle,
  productType,
  vendor,
  shop,
}: {
  shopifyId: string;
  title: string;
  handle: string;
  productType?: string;
  vendor?: string;
  shop: string;
}) {
  return await prisma.product.upsert({
    where: { shopifyId },
    update: {
      title,
      handle,
      productType,
      vendor,
      updatedAt: new Date(),
    },
    create: {
      shopifyId,
      title,
      handle,
      productType,
      vendor,
      shop,
    },
  });
}

export async function syncProductVariant({
  shopifyId,
  productId,
  title,
  sku,
  price,
  inventoryQty,
}: {
  shopifyId: string;
  productId: string;
  title: string;
  sku?: string;
  price?: string;
  inventoryQty?: number;
}) {
  return await prisma.productVariant.upsert({
    where: { shopifyId },
    update: {
      title,
      sku,
      price,
      inventoryQty,
      updatedAt: new Date(),
    },
    create: {
      shopifyId,
      productId,
      title,
      sku,
      price,
      inventoryQty,
    },
  });
}

export async function getProducts(shop: string) {
  return await prisma.product.findMany({
    where: { shop },
    include: {
      variants: true,
      _count: {
        select: { serials: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateVariantSerialRequirement({
  id,
  requireSerial,
}: {
  id: string;
  requireSerial: boolean;
}) {
  return await prisma.productVariant.update({
    where: { id },
    data: { requireSerial },
  });
}

export async function updateProductSerialRequirement({
  id,
  requireSerial,
}: {
  id: string;
  requireSerial: boolean;
}) {
  return await prisma.product.update({
    where: { id },
    data: { requireSerial },
  });
}