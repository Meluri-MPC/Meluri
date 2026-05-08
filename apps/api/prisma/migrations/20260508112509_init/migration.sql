-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpcOrganization" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "turnkeyOrgId" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "allowedDomains" TEXT[],
    "allowedAuthMethods" TEXT[] DEFAULT ARRAY['google', 'email']::TEXT[],
    "walletCount" INTEGER NOT NULL DEFAULT 0,
    "txCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpcOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpcWallet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stxAddress" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "turnkeyWalletId" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpcWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpcBalance" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "contractAddress" TEXT,
    "symbol" TEXT,
    "name" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 6,
    "balance" TEXT NOT NULL,
    "tokenId" TEXT,
    "metadataUri" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpcBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpcTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT,
    "amount" TEXT,
    "assetSymbol" TEXT,
    "assetPrincipal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "blockHeight" INTEGER,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "sponsored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "MpcTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Developer_email_key" ON "Developer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_developerId_idx" ON "ApiKey"("developerId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "MpcOrganization_apiKeyId_key" ON "MpcOrganization"("apiKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "MpcOrganization_turnkeyOrgId_key" ON "MpcOrganization"("turnkeyOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "MpcWallet_stxAddress_key" ON "MpcWallet"("stxAddress");

-- CreateIndex
CREATE UNIQUE INDEX "MpcWallet_publicKey_key" ON "MpcWallet"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "MpcWallet_turnkeyWalletId_key" ON "MpcWallet"("turnkeyWalletId");

-- CreateIndex
CREATE INDEX "MpcWallet_orgId_idx" ON "MpcWallet"("orgId");

-- CreateIndex
CREATE INDEX "MpcWallet_userId_idx" ON "MpcWallet"("userId");

-- CreateIndex
CREATE INDEX "MpcWallet_stxAddress_idx" ON "MpcWallet"("stxAddress");

-- CreateIndex
CREATE INDEX "MpcBalance_walletId_idx" ON "MpcBalance"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "MpcBalance_walletId_assetType_contractAddress_tokenId_key" ON "MpcBalance"("walletId", "assetType", "contractAddress", "tokenId");

-- CreateIndex
CREATE INDEX "MpcTransaction_walletId_idx" ON "MpcTransaction"("walletId");

-- CreateIndex
CREATE INDEX "MpcTransaction_txid_idx" ON "MpcTransaction"("txid");

-- CreateIndex
CREATE UNIQUE INDEX "MpcTransaction_walletId_txid_key" ON "MpcTransaction"("walletId", "txid");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpcOrganization" ADD CONSTRAINT "MpcOrganization_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpcWallet" ADD CONSTRAINT "MpcWallet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "MpcOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpcBalance" ADD CONSTRAINT "MpcBalance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "MpcWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpcTransaction" ADD CONSTRAINT "MpcTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "MpcWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
