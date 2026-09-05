-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'INVENTORY_MANAGER', 'PURCHASING', 'WAREHOUSE', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "CatalogSource" AS ENUM ('AMAZON_MAIN', 'OA_USA', 'MANUAL');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('BARCODE_PRIMARY', 'BARCODE_ALTERNATE', 'BARCODE_PREVIOUS', 'BARCODE_SUPPLIER', 'ASIN', 'AMAZON_SKU', 'OA_SKU', 'SUPPLIER_SKU');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('BUYBOX_WIN', 'BUYBOX_WIN_LOW_PROFIT', 'SELLING_AT_LOSS', 'NO_BUYBOX', 'INBOUND', 'RESERVED', 'UNFULFILLABLE', 'OOS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReorderStatus" AS ENUM ('NO_REORDER', 'MONITOR', 'NEAR_OOS', 'REORDER_REQUIRED', 'HIGH_PRIORITY_REORDER', 'SUPPLIER_AVAILABLE', 'SUPPLIER_NOT_FOUND', 'NOT_PROFITABLE_TO_REORDER');

-- CreateEnum
CREATE TYPE "ProfitStatus" AS ENUM ('HIGH_PROFIT', 'PROFITABLE', 'LOW_PROFIT', 'BREAK_EVEN', 'LOSS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SalesPeriod" AS ENUM ('T30', 'T60');

-- CreateEnum
CREATE TYPE "LocationCode" AS ENUM ('AMAZON', 'ROVER', 'OFFICE', 'INCOMING_PO');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "TxnSourceType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'PO_RECEIPT', 'ADJUSTMENT', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "PurchasePlanItemStatus" AS ENUM ('SUGGESTED', 'REVIEWING', 'APPROVED', 'ORDERED', 'PARTIALLY_ORDERED', 'AWAITING_INVOICE', 'INVOICED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UPLOADED', 'MATCHING', 'REVIEWED', 'APPROVED', 'RECEIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceLineStatus" AS ENUM ('PRICE_OK', 'PRICE_DECREASED', 'PRICE_INCREASED', 'LARGE_PRICE_INCREASE', 'LOW_PROFIT', 'LOSS', 'BETTER_SUPPLIER_AVAILABLE', 'QTY_DIFFERENCE', 'UNKNOWN_PRODUCT', 'BARCODE_NOT_MATCHED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ReorderPriority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('AMAZON_OOS', 'NEAR_OOS', 'LOW_DAYS_STOCK', 'HIGH_SALES_LOW_STOCK', 'BSR_REORDER_NEEDED', 'SUPPLIER_STOCK_FOR_OOS', 'SUPPLIER_PRICE_DROPPED', 'SUPPLIER_PRICE_INCREASED', 'SELLING_AT_LOSS', 'ROI_BELOW_THRESHOLD', 'INVOICE_PRICE_INCREASED', 'BETTER_SUPPLIER_AVAILABLE', 'DUPLICATE_BARCODE', 'MISSING_ASIN', 'UNKNOWN_BARCODE', 'NEGATIVE_WAREHOUSE_STOCK', 'HIGH_INVENTORY_NO_SALES', 'OVERSTOCK', 'SOURCE_MAPPING_ISSUE');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('CSV', 'XLSX', 'GOOGLE_SHEETS', 'PDF');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SheetConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTION_REQUIRED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "primaryBarcode" TEXT,
    "asin" TEXT,
    "amazonSku" TEXT,
    "oaSku" TEXT,
    "supplierSku" TEXT,
    "brand" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "catalogSource" "CatalogSource" NOT NULL DEFAULT 'AMAZON_MAIN',
    "listingStatus" "ListingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "reorderStatus" "ReorderStatus" NOT NULL DEFAULT 'NO_REORDER',
    "bsr" INTEGER,
    "unitsShippedT30" INTEGER,
    "lastMonthSale" INTEGER,
    "amazonAvailableQty" INTEGER NOT NULL DEFAULT 0,
    "amazonReservedQty" INTEGER NOT NULL DEFAULT 0,
    "amazonInboundQty" INTEGER NOT NULL DEFAULT 0,
    "amazonUnfulfillableQty" INTEGER NOT NULL DEFAULT 0,
    "buyBoxPrice" DECIMAL(12,4),
    "ourPrice" DECIMAL(12,4),
    "miniPrice" DECIMAL(12,4),
    "roverQty" INTEGER NOT NULL DEFAULT 0,
    "officeQty" INTEGER NOT NULL DEFAULT 0,
    "incomingPoQty" INTEGER NOT NULL DEFAULT 0,
    "shelfLocation" TEXT,
    "qtyPerBox" INTEGER,
    "totalBoxes" INTEGER,
    "looseQty" INTEGER,
    "currentCost" DECIMAL(12,4),
    "currentCostWithVat" DECIMAL(12,4),
    "lastPurchaseCost" DECIMAL(12,4),
    "lastPurchaseDate" TIMESTAMP(3),
    "weightedAvgCost" DECIMAL(12,4),
    "lowestHistoricalCost" DECIMAL(12,4),
    "highestHistoricalCost" DECIMAL(12,4),
    "firstPurchaseDate" TIMESTAMP(3),
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimePurchasedQty" INTEGER NOT NULL DEFAULT 0,
    "fbaFee" DECIMAL(12,4),
    "referralFee" DECIMAL(12,4),
    "breakevenPrice" DECIMAL(12,4),
    "profitPerUnit" DECIMAL(12,4),
    "roiPct" DECIMAL(9,4),
    "marginPct" DECIMAL(9,4),
    "profitStatus" "ProfitStatus" NOT NULL DEFAULT 'UNKNOWN',
    "inventoryValue" DECIMAL(14,4),
    "preferredSupplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_identifiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_source_mappings" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" "CatalogSource" NOT NULL,
    "sourceSku" TEXT,
    "sourceRowFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_source_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amazon_stats" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" "CatalogSource" NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "brandName" TEXT,
    "listingStatus" TEXT,
    "bsr" INTEGER,
    "lastMonthSale" INTEGER,
    "unitsShippedT30" INTEGER,
    "inboundQty" INTEGER,
    "reservedQty" INTEGER,
    "unfulfillableQty" INTEGER,
    "availableQty" INTEGER,
    "availableQtyValue" DECIMAL(14,4),
    "costPrice" DECIMAL(12,4),
    "costPriceWithVat" DECIMAL(12,4),
    "fbaFee" DECIMAL(12,4),
    "referralFee" DECIMAL(12,4),
    "breakevenPrice" DECIMAL(12,4),
    "buyBoxPrice" DECIMAL(12,4),
    "profitLoss" DECIMAL(12,4),
    "profitPct" DECIMAL(9,4),
    "roi" DECIMAL(9,4),
    "miniPrice" DECIMAL(12,4),
    "ourPrice" DECIMAL(12,4),
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amazon_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "periodType" "SalesPeriod" NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" TEXT NOT NULL,
    "code" "LocationCode" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "direction" "TxnDirection" NOT NULL,
    "sourceType" "TxnSourceType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "shipmentReference" TEXT,
    "fcDestination" TEXT,
    "newCostPrice" DECIMAL(12,4),
    "oldCostPrice" DECIMAL(12,4),
    "brand" TEXT,
    "productTitleRaw" TEXT,
    "barcodeRaw" TEXT,
    "remarks" TEXT,
    "fingerprint" TEXT NOT NULL,
    "supplierId" TEXT,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "valuationCost" DECIMAL(14,4),
    "snapshotDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "moq" INTEGER,
    "casePack" INTEGER,
    "leadTimeDays" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "lastUpdateAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "price" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "stockQty" INTEGER,
    "moq" INTEGER,
    "casePack" INTEGER,
    "leadTimeDays" INTEGER,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_price_history" (
    "id" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "importJobId" TEXT,

    CONSTRAINT "supplier_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "systemRecommendedQty" INTEGER NOT NULL,
    "userFinalQty" INTEGER,
    "supplierStockQty" INTEGER,
    "supplierPrice" DECIMAL(12,4),
    "expectedTotalCost" DECIMAL(14,4),
    "expectedProfit" DECIMAL(14,4),
    "roiPct" DECIMAL(9,4),
    "notes" TEXT,
    "status" "PurchasePlanItemStatus" NOT NULL DEFAULT 'SUGGESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedDelivery" TIMESTAMP(3),
    "invoiceReference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "planItemId" TEXT,
    "qtyOrdered" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "expectedTotal" DECIMAL(14,4) NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "fileName" TEXT,
    "fileType" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UPLOADED',
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "barcodeRaw" TEXT,
    "asinRaw" TEXT,
    "skuRaw" TEXT,
    "titleRaw" TEXT,
    "invoiceQty" INTEGER NOT NULL,
    "invoicePrice" DECIMAL(12,4) NOT NULL,
    "lastPurchasePrice" DECIMAL(12,4),
    "weightedAvgPrice" DECIMAL(12,4),
    "lowestHistoricalPrice" DECIMAL(12,4),
    "currentMasterCost" DECIMAL(12,4),
    "bestCurrentSupplierPrice" DECIMAL(12,4),
    "priceDiff" DECIMAL(12,4),
    "priceDiffPct" DECIMAL(9,4),
    "currentSellingPrice" DECIMAL(12,4),
    "estFbaFee" DECIMAL(12,4),
    "referralFee" DECIMAL(12,4),
    "profit" DECIMAL(12,4),
    "roiPct" DECIMAL(9,4),
    "status" "InvoiceLineStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "linkedPoItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "barcodeRaw" TEXT,
    "qty" INTEGER NOT NULL,
    "newCost" DECIMAL(12,4) NOT NULL,
    "previousCost" DECIMAL(12,4),
    "priceDiff" DECIMAL(12,4),
    "priceDiffPct" DECIMAL(9,4),
    "source" TEXT,
    "importJobId" TEXT,

    CONSTRAINT "purchase_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_recommendations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bsr" INTEGER,
    "t30Sales" INTEGER,
    "t60Sales" INTEGER,
    "t60IsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "avgDailySales" DECIMAL(10,4),
    "amazonQty" INTEGER NOT NULL,
    "roverQty" INTEGER NOT NULL,
    "officeQty" INTEGER NOT NULL,
    "incomingQty" INTEGER NOT NULL,
    "netAvailable" INTEGER NOT NULL,
    "daysOfStock" DECIMAL(10,2),
    "stockStatus" TEXT,
    "targetDemand30" INTEGER NOT NULL,
    "recommendedQty30" INTEGER NOT NULL,
    "targetDemand60" INTEGER NOT NULL,
    "recommendedQty60" INTEGER NOT NULL,
    "priority" "ReorderPriority" NOT NULL DEFAULT 'NONE',
    "reorderStatus" "ReorderStatus" NOT NULL DEFAULT 'NO_REORDER',
    "bestSupplierId" TEXT,
    "bestSupplierPrice" DECIMAL(12,4),
    "expectedProfitPerUnit" DECIMAL(12,4),
    "expectedRoiPct" DECIMAL(9,4),
    "breakdown" JSONB NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reorder_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "productId" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "tabName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "productsAdded" INTEGER NOT NULL DEFAULT 0,
    "productsUpdated" INTEGER NOT NULL DEFAULT 0,
    "newStockInTxns" INTEGER NOT NULL DEFAULT 0,
    "newStockOutTxns" INTEGER NOT NULL DEFAULT 0,
    "priceChanges" INTEGER NOT NULL DEFAULT 0,
    "stockChanges" INTEGER NOT NULL DEFAULT 0,
    "mappingErrors" INTEGER NOT NULL DEFAULT 0,
    "unmatchedProducts" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "triggeredById" TEXT,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "matchedProductId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_queue" (
    "id" TEXT NOT NULL,
    "candidateType" TEXT NOT NULL,
    "rawIdentifier" TEXT,
    "rawTitle" TEXT,
    "rawBrand" TEXT,
    "suggestedProductId" TEXT,
    "confidence" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "matching_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_connections" (
    "id" TEXT NOT NULL,
    "workbookName" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "status" "SheetConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastSuccessfulSync" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "autoSyncInterval" TEXT NOT NULL DEFAULT 'MANUAL_ONLY',
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "writeBackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_tab_mappings" (
    "id" TEXT NOT NULL,
    "sheetConnectionId" TEXT NOT NULL,
    "tabName" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "columnMap" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_tab_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "setting_changes" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" TEXT,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "products_primaryBarcode_idx" ON "products"("primaryBarcode");

-- CreateIndex
CREATE INDEX "products_asin_idx" ON "products"("asin");

-- CreateIndex
CREATE INDEX "products_amazonSku_idx" ON "products"("amazonSku");

-- CreateIndex
CREATE INDEX "products_oaSku_idx" ON "products"("oaSku");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "products_reorderStatus_idx" ON "products"("reorderStatus");

-- CreateIndex
CREATE INDEX "products_listingStatus_idx" ON "products"("listingStatus");

-- CreateIndex
CREATE INDEX "product_identifiers_value_idx" ON "product_identifiers"("value");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifiers_type_value_key" ON "product_identifiers"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_source_mappings_source_sourceSku_key" ON "product_source_mappings"("source", "sourceSku");

-- CreateIndex
CREATE INDEX "amazon_stats_productId_isCurrent_idx" ON "amazon_stats"("productId", "isCurrent");

-- CreateIndex
CREATE INDEX "amazon_stats_productId_effectiveDate_idx" ON "amazon_stats"("productId", "effectiveDate");

-- CreateIndex
CREATE INDEX "sales_history_productId_periodType_periodEnd_idx" ON "sales_history"("productId", "periodType", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_locations_code_key" ON "inventory_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_productId_locationId_key" ON "inventory_balances"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_fingerprint_key" ON "inventory_transactions"("fingerprint");

-- CreateIndex
CREATE INDEX "inventory_transactions_productId_transactionDate_idx" ON "inventory_transactions"("productId", "transactionDate");

-- CreateIndex
CREATE INDEX "inventory_transactions_locationId_transactionDate_idx" ON "inventory_transactions"("locationId", "transactionDate");

-- CreateIndex
CREATE INDEX "inventory_snapshots_productId_snapshotDate_idx" ON "inventory_snapshots"("productId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplierId_productId_key" ON "supplier_products"("supplierId", "productId");

-- CreateIndex
CREATE INDEX "supplier_price_history_supplierProductId_effectiveDate_idx" ON "supplier_price_history"("supplierProductId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_history_transactionId_key" ON "purchase_history"("transactionId");

-- CreateIndex
CREATE INDEX "purchase_history_productId_date_idx" ON "purchase_history"("productId", "date");

-- CreateIndex
CREATE INDEX "reorder_recommendations_productId_isLatest_idx" ON "reorder_recommendations"("productId", "isLatest");

-- CreateIndex
CREATE INDEX "reorder_recommendations_reorderStatus_idx" ON "reorder_recommendations"("reorderStatus");

-- CreateIndex
CREATE INDEX "reorder_recommendations_priority_idx" ON "reorder_recommendations"("priority");

-- CreateIndex
CREATE INDEX "alerts_status_severity_idx" ON "alerts"("status", "severity");

-- CreateIndex
CREATE INDEX "alerts_type_idx" ON "alerts"("type");

-- CreateIndex
CREATE INDEX "import_rows_importJobId_status_idx" ON "import_rows"("importJobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_connections_workbookName_key" ON "sheet_connections"("workbookName");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_tab_mappings_sheetConnectionId_tabName_key" ON "sheet_tab_mappings"("sheetConnectionId", "tabName");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_source_mappings" ADD CONSTRAINT "product_source_mappings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amazon_stats" ADD CONSTRAINT "amazon_stats_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amazon_stats" ADD CONSTRAINT "amazon_stats_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_history" ADD CONSTRAINT "sales_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_history" ADD CONSTRAINT "supplier_price_history_supplierProductId_fkey" FOREIGN KEY ("supplierProductId") REFERENCES "supplier_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_plans" ADD CONSTRAINT "purchase_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_plan_items" ADD CONSTRAINT "purchase_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "purchase_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_plan_items" ADD CONSTRAINT "purchase_plan_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_plan_items" ADD CONSTRAINT "purchase_plan_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "purchase_plan_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_history" ADD CONSTRAINT "purchase_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_recommendations" ADD CONSTRAINT "reorder_recommendations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_queue" ADD CONSTRAINT "matching_queue_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matching_queue" ADD CONSTRAINT "matching_queue_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_tab_mappings" ADD CONSTRAINT "sheet_tab_mappings_sheetConnectionId_fkey" FOREIGN KEY ("sheetConnectionId") REFERENCES "sheet_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_key_fkey" FOREIGN KEY ("key") REFERENCES "settings"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

