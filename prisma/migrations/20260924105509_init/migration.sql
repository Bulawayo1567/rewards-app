-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('ORDER', 'ORDER_REVERSAL', 'REDEEM', 'REDEEM_REVERSAL', 'BIRTHDAY', 'NEWSLETTER', 'SIGNUP', 'REVIEW', 'REFERRAL', 'CAMPAIGN', 'ADJUSTMENT', 'EXPIRY', 'MIGRATION');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'AVAILABLE', 'REVERSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TierBasis" AS ENUM ('LIFETIME_POINTS', 'ROLLING_12M_SPEND', 'LIFETIME_SPEND');

-- CreateEnum
CREATE TYPE "EarnEvent" AS ENUM ('BIRTHDAY', 'NEWSLETTER', 'SIGNUP', 'REVIEW', 'REFERRAL_REFERRER', 'REFERRAL_FRIEND');

-- CreateEnum
CREATE TYPE "ProductRuleTarget" AS ENUM ('PRODUCT', 'VARIANT', 'COLLECTION', 'VENDOR', 'TAG', 'PRODUCT_TYPE');

-- CreateEnum
CREATE TYPE "ProductRuleMode" AS ENUM ('EXCLUDE', 'MULTIPLIER', 'FIXED_BONUS');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'FREE_SHIPPING', 'FREE_PRODUCT');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('ISSUED', 'USED', 'REVERSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('WHEEL', 'SCRATCH', 'INSTANT');

-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('PERCENT_OFF', 'AMOUNT_OFF', 'FREE_SHIPPING', 'POINTS', 'NOTHING');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'All About Sewing Rewards',
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "pointsPerDollar" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "pointsName" TEXT NOT NULL DEFAULT 'points',
    "holdDays" INTEGER NOT NULL DEFAULT 0,
    "expiryMonths" INTEGER,
    "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
    "earnOnDiscountedTotal" BOOLEAN NOT NULL DEFAULT true,
    "earnOnShipping" BOOLEAN NOT NULL DEFAULT false,
    "earnOnTax" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "codePrefix" TEXT NOT NULL DEFAULT 'RW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthday" TIMESTAMP(3),
    "birthdayAwardedYear" INTEGER,
    "newsletterAwarded" BOOLEAN NOT NULL DEFAULT false,
    "signupAwarded" BOOLEAN NOT NULL DEFAULT false,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "pendingBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tierId" TEXT,
    "tierAssignedAt" TIMESTAMP(3),
    "smileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "points" INTEGER NOT NULL,
    "orderId" TEXT,
    "orderName" TEXT,
    "redemptionId" TEXT,
    "note" TEXT,
    "staffEmail" TEXT,
    "availableAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "threshold" DECIMAL(12,2) NOT NULL,
    "basis" "TierBasis" NOT NULL DEFAULT 'LIFETIME_POINTS',
    "multiplier" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "perks" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarnRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "event" "EarnEvent" NOT NULL,
    "points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarnRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "target" "ProductRuleTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "mode" "ProductRuleMode" NOT NULL,
    "value" DECIMAL(10,3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RewardType" NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "value" DECIMAL(10,2),
    "variantId" TEXT,
    "minOrderSubtotal" DECIMAL(10,2),
    "codeValidDays" INTEGER NOT NULL DEFAULT 90,
    "minTierRank" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "discountCode" TEXT NOT NULL,
    "discountNodeId" TEXT,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'ISSUED',
    "usedOrderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Spin to win',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "showDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "showOnPages" TEXT NOT NULL DEFAULT 'home',
    "onePlayPerEmail" BOOLEAN NOT NULL DEFAULT true,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "grantNewsletterPoints" BOOLEAN NOT NULL DEFAULT true,
    "primaryColor" TEXT NOT NULL DEFAULT '#c60d11',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPrize" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PrizeType" NOT NULL,
    "value" DECIMAL(10,2),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "codeValidDays" INTEGER NOT NULL DEFAULT 14,
    "minOrderSubtotal" DECIMAL(10,2),
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPlay" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "customerId" TEXT,
    "discountCode" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'smile.io',
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "staffEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_shop_key" ON "Program"("shop");

-- CreateIndex
CREATE INDEX "Customer_shop_shopifyId_idx" ON "Customer"("shop", "shopifyId");

-- CreateIndex
CREATE INDEX "Customer_shop_tierId_idx" ON "Customer"("shop", "tierId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shop_email_key" ON "Customer"("shop", "email");

-- CreateIndex
CREATE INDEX "PointsLedger_shop_customerId_createdAt_idx" ON "PointsLedger"("shop", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsLedger_shop_orderId_idx" ON "PointsLedger"("shop", "orderId");

-- CreateIndex
CREATE INDEX "PointsLedger_status_availableAt_idx" ON "PointsLedger"("status", "availableAt");

-- CreateIndex
CREATE INDEX "PointsLedger_status_expiresAt_idx" ON "PointsLedger"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_shop_rank_key" ON "Tier"("shop", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_shop_name_key" ON "Tier"("shop", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EarnRule_shop_event_key" ON "EarnRule"("shop", "event");

-- CreateIndex
CREATE INDEX "ProductRule_shop_target_targetId_idx" ON "ProductRule"("shop", "target", "targetId");

-- CreateIndex
CREATE INDEX "Reward_shop_active_idx" ON "Reward"("shop", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_discountCode_key" ON "Redemption"("discountCode");

-- CreateIndex
CREATE INDEX "Redemption_shop_customerId_idx" ON "Redemption"("shop", "customerId");

-- CreateIndex
CREATE INDEX "Redemption_shop_status_expiresAt_idx" ON "Redemption"("shop", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Campaign_shop_active_idx" ON "Campaign"("shop", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPlay_discountCode_key" ON "CampaignPlay"("discountCode");

-- CreateIndex
CREATE INDEX "CampaignPlay_shop_campaignId_createdAt_idx" ON "CampaignPlay"("shop", "campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPlay_campaignId_email_key" ON "CampaignPlay"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPrize" ADD CONSTRAINT "CampaignPrize_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "CampaignPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
