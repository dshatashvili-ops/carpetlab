-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OPERATOR', 'CUTTER');

-- CreateEnum
CREATE TYPE "CutMode" AS ENUM ('LINEAR', 'ANY');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('ROLL', 'REMNANT');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('MATERIAL', 'CARPET');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('RECEIPT', 'CUT_CONSUME', 'CUT_OUTPUT', 'MANUAL_WRITE_OFF', 'MANUAL_RECEIPT', 'EDIT_REVERSAL');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('YOOKASSA', 'INVOICE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "NoticeKind" AS ENUM ('D30', 'D15', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gsPrefix" TEXT,
    "minRemnantSideCm" INTEGER NOT NULL DEFAULT 30,
    "labelWidthMm" INTEGER NOT NULL DEFAULT 58,
    "labelHeightMm" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "isServiceAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "orgId" UUID,
    "role" "Role",
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "plan" INTEGER NOT NULL DEFAULT 1,
    "status" "SubStatus" NOT NULL DEFAULT 'TRIAL',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffPrice" (
    "id" UUID NOT NULL,
    "plan" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "priceKopecks" INTEGER NOT NULL,

    CONSTRAINT "TariffPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "plan" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionNotice" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "NoticeKind" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rollWidthCm" INTEGER NOT NULL,
    "cutMode" "CutMode" NOT NULL,
    "barcodeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "photoKey" TEXT,
    "photoBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeTemplate" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,

    CONSTRAINT "SizeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "widthCm" INTEGER NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "kind" "MaterialKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "sizeId" UUID NOT NULL,
    "ean13" TEXT,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "itemType" "ItemType" NOT NULL,
    "materialId" UUID,
    "skuId" UUID,
    "qtyDelta" INTEGER NOT NULL,
    "documentId" UUID,
    "reason" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutDocument" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "articleId" UUID NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutDocumentLine" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sourceMaterialId" UUID NOT NULL,
    "sizeId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "CutDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CutDocumentVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editedBy" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarcodeSequence" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BarcodeSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocCounter" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffPrice_plan_months_key" ON "TariffPrice"("plan", "months");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionNotice_orgId_kind_expiresAt_key" ON "SubscriptionNotice"("orgId", "kind", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_orgId_code_key" ON "Article"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SizeTemplate_orgId_widthCm_lengthCm_key" ON "SizeTemplate"("orgId", "widthCm", "lengthCm");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_articleId_sizeId_key" ON "Sku"("articleId", "sizeId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_orgId_ean13_key" ON "Sku"("orgId", "ean13");

-- CreateIndex
CREATE INDEX "StockMovement_orgId_materialId_idx" ON "StockMovement"("orgId", "materialId");

-- CreateIndex
CREATE INDEX "StockMovement_orgId_skuId_idx" ON "StockMovement"("orgId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "CutDocument_orgId_number_key" ON "CutDocument"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CutDocumentVersion_documentId_version_key" ON "CutDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeSequence_orgId_key" ON "BarcodeSequence"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DocCounter_orgId_key" ON "DocCounter"("orgId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Row-Level Security (tenant isolation) =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Article','SizeTemplate','Material','Sku','StockMovement','CutDocument','CutDocumentLine','CutDocumentVersion','BarcodeSequence','DocCounter']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING ("orgId" = nullif(current_setting('app.org_id', true), '')::uuid) WITH CHECK ("orgId" = nullif(current_setting('app.org_id', true), '')::uuid)$p$, t);
  END LOOP;
END $$;

-- ===== Runtime role grants (role created by deployment: CREATE ROLE carpet_app LOGIN NOBYPASSRLS) =====
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carpet_app') THEN
    GRANT USAGE ON SCHEMA public TO carpet_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO carpet_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO carpet_app;
  END IF;
END $$;
