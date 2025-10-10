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
