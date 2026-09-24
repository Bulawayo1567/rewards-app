import prisma from "../../db.server";

/** Returns the shop's program row, creating sensible defaults on first call. */
export async function getProgram(shop: string) {
  return prisma.program.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      name: "All About Sewing Rewards",
      currency: "CAD",
      pointsPerDollar: 1,
      holdDays: 0,
      codePrefix: "RW",
    },
  });
}
