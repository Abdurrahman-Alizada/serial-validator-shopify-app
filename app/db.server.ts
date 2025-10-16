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
  status: "AVAILABLE" | "SOLD" | "RETURNED" | "DELETED";
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
  // Enforce single serial per variant constraint
  if (serialIds.length > 1) {
    throw new Error("Only one serial number can be assigned to a variant");
  }

  // Check if this variant already has a serial assigned
  const existingSerial = await prisma.serial.findFirst({
    where: {
      variantId,
      status: { in: ["RESERVED", "SOLD"] }
    },
    select: { serialNumber: true }
  });

  if (existingSerial) {
    throw new Error(`This variant already has a serial number assigned: ${existingSerial.serialNumber}`);
  }

  // First check if any of these serials are already assigned
  const alreadyAssigned = await prisma.serial.findMany({
    where: {
      id: { in: serialIds },
      OR: [
        { productId: { not: null } },
        { variantId: { not: null } }
      ]
    },
    select: { serialNumber: true }
  });

  if (alreadyAssigned.length > 0) {
    throw new Error(`Some serial numbers are already assigned: ${alreadyAssigned.map(s => s.serialNumber).join(', ')}`);
  }

  // Update only unassigned serials
  return await prisma.serial.updateMany({
    where: { 
      id: { in: serialIds },
      productId: null,
      variantId: null,
      status: "AVAILABLE"
    },
    data: {
      productId,
      variantId,
      status: "RESERVED",
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
      status: { in: ["RESERVED", "AVAILABLE"] }
    },
    data: {
      productId: null,
      variantId: null,
      status: "AVAILABLE",
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