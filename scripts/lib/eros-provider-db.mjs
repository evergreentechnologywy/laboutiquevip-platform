import { canonicalErosProfileUrl, erosFileId } from "./eros-url.mjs";

export async function findExistingErosProvider(prisma, sourceUrl) {
  if (!prisma || !sourceUrl) return null;

  const fileId = erosFileId(sourceUrl);
  if (fileId) {
    const byFile = await prisma.provider.findFirst({
      where: {
        verification_provider: "eros",
        verification_url: { contains: `/files/${fileId}.htm`, mode: "insensitive" },
      },
    });
    if (byFile) return byFile;
  }

  const canonical = canonicalErosProfileUrl(sourceUrl);
  if (!canonical) return null;

  const rows = await prisma.$queryRaw`
    SELECT id
    FROM "Provider"
    WHERE verification_provider = 'eros'
      AND verification_url IS NOT NULL
      AND lower(regexp_replace(trim(verification_url), '\\?.*$', '')) = ${canonical}
    LIMIT 1
  `;
  const id = rows?.[0]?.id;
  if (!id) return null;
  return prisma.provider.findUnique({ where: { id } });
}
