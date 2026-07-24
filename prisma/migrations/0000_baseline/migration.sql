-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis_raster";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('ACTIVITY', 'REST', 'MEAL_ANCHOR', 'MEAL_FLOATING', 'TRANSIT');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CASH_HEAVY', 'BALANCED', 'DIGITAL_ONLY');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('ATTRACTION', 'RESTAURANT', 'SHOPPING', 'HOTEL', 'TRANSIT_HUB', 'HOSPITAL');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "adcode" TEXT,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "location" geography,
    "timezone" TEXT,
    "metadata" JSONB,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryProfile" (
    "isoCode" TEXT NOT NULL,
    "nameCN" TEXT NOT NULL,
    "powerInfo" JSONB,
    "emergency" JSONB,
    "paymentInfo" JSONB,
    "visaForCN" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT,
    "currencyName" TEXT,
    "exchangeRateToCNY" DOUBLE PRECISION,
    "paymentType" "PaymentType",
    "exchangeRateToUSD" DOUBLE PRECISION,
    "nameEN" TEXT,
    "complianceInfo" JSONB,
    "travelCulture" JSONB,

    CONSTRAINT "CountryProfile_pkey" PRIMARY KEY ("isoCode")
);

-- CreateTable
CREATE TABLE "DayOfWeekFactor" (
    "id" SERIAL NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "avgPrice" DOUBLE PRECISION,
    "totalAvgPrice" DOUBLE PRECISION,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOfWeekFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightPriceDetail" (
    "id" SERIAL NOT NULL,
    "routeId" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "monthlyBasePrice" DOUBLE PRECISION NOT NULL,
    "dayOfWeekFactor" DOUBLE PRECISION,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "stdDev" DOUBLE PRECISION,
    "source" TEXT DEFAULT '2023-2024年历史数据',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destinationAirport" TEXT,
    "destinationAirportLatitude" DOUBLE PRECISION,
    "destinationAirportLongitude" DOUBLE PRECISION,
    "originAirport" TEXT,
    "originAirportLatitude" DOUBLE PRECISION,
    "originAirportLongitude" DOUBLE PRECISION,
    "airlineCount" INTEGER DEFAULT 0,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "isWeekend" BOOLEAN DEFAULT false,
    "monthFactor" DOUBLE PRECISION,
    "timeOfDayFactor" DOUBLE PRECISION,

    CONSTRAINT "FlightPriceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightPriceReference" (
    "id" SERIAL NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "originCity" VARCHAR(10),
    "lowSeasonPrice" INTEGER NOT NULL,
    "highSeasonPrice" INTEGER NOT NULL,
    "averagePrice" INTEGER NOT NULL,
    "visaCost" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(255),
    "lastUpdated" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightPriceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPriceDetail" (
    "city" TEXT NOT NULL,
    "avgPrice" DOUBLE PRECISION,
    "medianPrice" DOUBLE PRECISION,
    "cityFactor" DOUBLE PRECISION,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "stdDev" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelPriceDetail_pkey" PRIMARY KEY ("city")
);

-- CreateTable
CREATE TABLE "HotelWideData_Quarterly" (
    "id" SERIAL NOT NULL,
    "city" TEXT,
    "starRating" INTEGER,
    "2018_Q1" DOUBLE PRECISION,
    "2018_Q2" DOUBLE PRECISION,
    "2018_Q3" DOUBLE PRECISION,
    "2018_Q4" DOUBLE PRECISION,
    "2019_Q1" DOUBLE PRECISION,
    "2019_Q2" DOUBLE PRECISION,
    "2019_Q3" DOUBLE PRECISION,
    "2019_Q4" DOUBLE PRECISION,
    "2020_Q1" DOUBLE PRECISION,
    "2020_Q2" DOUBLE PRECISION,
    "2020_Q3" DOUBLE PRECISION,
    "2020_Q4" DOUBLE PRECISION,
    "2021_Q1" DOUBLE PRECISION,
    "2021_Q2" DOUBLE PRECISION,
    "2021_Q3" DOUBLE PRECISION,
    "2021_Q4" DOUBLE PRECISION,
    "2022_Q1" DOUBLE PRECISION,
    "2022_Q2" DOUBLE PRECISION,
    "2022_Q3" DOUBLE PRECISION,
    "2022_Q4" DOUBLE PRECISION,
    "2023_Q1" DOUBLE PRECISION,
    "2023_Q2" DOUBLE PRECISION,
    "2023_Q3" DOUBLE PRECISION,
    "2023_Q4" DOUBLE PRECISION,
    "2024_Q1" DOUBLE PRECISION,

    CONSTRAINT "HotelWideData_Quarterly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItineraryItem" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "type" "ItemType" NOT NULL,
    "placeId" INTEGER,
    "tripDayId" TEXT NOT NULL,
    "note" TEXT,
    "trailId" INTEGER,
    "actualCost" DOUBLE PRECISION,
    "costCategory" TEXT,
    "costNote" TEXT,
    "currency" TEXT DEFAULT 'CNY',
    "estimatedCost" DOUBLE PRECISION,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidBy" TEXT,
    "bookedAt" TIMESTAMP(3),
    "bookingConfirmation" TEXT,
    "bookingStatus" TEXT,
    "bookingUrl" TEXT,
    "travelFromPreviousDistance" INTEGER,
    "travelFromPreviousDuration" INTEGER,
    "travelMode" TEXT,
    "order" INTEGER,

    CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "nameEN" TEXT,
    "category" "PlaceCategory" NOT NULL,
    "location" geography,
    "address" TEXT,
    "cityId" INTEGER,
    "metadata" JSONB,
    "ontologyRules" JSONB,
    "physicalMetadata" JSONB,
    "googlePlaceId" TEXT,
    "rating" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nameCN" TEXT NOT NULL,
    "description" TEXT,
    "embedding" vector,
    "last_verified_at" TIMESTAMPTZ(6),
    "data_source" VARCHAR(50),
    "data_freshness" VARCHAR(20),
    "districtId" INTEGER,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceEdge" (
    "id" SERIAL NOT NULL,
    "fromPlaceId" INTEGER NOT NULL,
    "toPlaceId" INTEGER NOT NULL,
    "distanceM" INTEGER,
    "walkTimeMin" INTEGER,
    "transitTimeMin" INTEGER,
    "experienceTransition" VARCHAR(64),
    "source" VARCHAR(32) DEFAULT 'computed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "center" geography,
    "radiusM" INTEGER,
    "dominantExperience" VARCHAR(64),
    "vibe" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrowdCurve" (
    "id" SERIAL NOT NULL,
    "placeId" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "crowdLevel" DOUBLE PRECISION NOT NULL,
    "source" VARCHAR(32) DEFAULT 'estimated',
    "dayOfWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrowdCurve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RailPassProfile" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "residencyCountry" TEXT NOT NULL,
    "passFamily" TEXT NOT NULL,
    "passType" TEXT NOT NULL,
    "validityType" TEXT NOT NULL,
    "travelDaysTotal" INTEGER,
    "homeCountryOutboundUsed" INTEGER NOT NULL DEFAULT 0,
    "homeCountryInboundUsed" INTEGER NOT NULL DEFAULT 0,
    "class" TEXT NOT NULL,
    "mobileOrPaper" TEXT NOT NULL,
    "validityStartDate" TIMESTAMP(3) NOT NULL,
    "validityEndDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RailPassProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RailSegment" (
    "id" TEXT NOT NULL,
    "railPassProfileId" TEXT NOT NULL,
    "itineraryItemId" TEXT,
    "fromPlaceId" INTEGER NOT NULL,
    "toPlaceId" INTEGER NOT NULL,
    "fromCountryCode" TEXT NOT NULL,
    "toCountryCode" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "departureTimeWindow" JSONB,
    "arrivalDeadline" TIMESTAMP(3),
    "operatorHint" TEXT,
    "isNightTrain" BOOLEAN NOT NULL DEFAULT false,
    "isHighSpeed" BOOLEAN NOT NULL DEFAULT false,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "t_api" INTEGER,
    "t_robust" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RailSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawAttractionData" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "address" TEXT,
    "province" TEXT,
    "publishDate" TEXT,
    "documentUrl" TEXT,
    "encodedAddress" TEXT,
    "lng" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawAttractionData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawFlightData" (
    "起飞机场y" DECIMAL,
    "起飞机场x" DECIMAL,
    "降落机场y" DECIMAL,
    "降落机场x" DECIMAL
);

-- CreateTable
CREATE TABLE "RawHotelData_Slim" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "brand" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "type" TEXT,
    "adcode" TEXT,

    CONSTRAINT "RawHotelData_Slim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawTrainStationData" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "railwayBureau" TEXT,
    "category" TEXT,
    "nature" TEXT,
    "province" TEXT,
    "city" TEXT,
    "wgs84Lng" DOUBLE PRECISION,
    "wgs84Lat" DOUBLE PRECISION,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RawTrainStationData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessPack" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL,
    "countryCode" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "packData" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "city_cn" TEXT,
    "city_en" TEXT,
    "display_name_cn" TEXT,
    "display_name_en" TEXT,
    "region_cn" TEXT,
    "region_en" TEXT,

    CONSTRAINT "ReadinessPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_readiness_decision" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "pack_id" TEXT,
    "user_id" UUID,
    "answers" JSONB NOT NULL,
    "decision_result" JSONB NOT NULL,
    "matched_branch_id" TEXT,
    "block_trip" BOOLEAN NOT NULL DEFAULT false,
    "updated_action" JSONB,
    "category" TEXT,
    "severity" TEXT,
    "level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "readinessPackId" TEXT,

    CONSTRAINT "trip_readiness_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationTask" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "railPassProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bookingRef" TEXT,
    "cost" DOUBLE PRECISION,
    "failReason" TEXT,
    "fallbackPlanId" TEXT,
    "travelDay" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteDirection" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameCN" TEXT NOT NULL,
    "nameEN" TEXT,
    "description" TEXT,
    "tags" TEXT[],
    "corridorGeom" geography,
    "regions" TEXT[],
    "entryHubs" TEXT[],
    "seasonality" JSONB,
    "constraints" JSONB,
    "riskProfile" JSONB,
    "signaturePois" JSONB,
    "itinerarySkeleton" JSONB,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT DEFAULT 'active',
    "version" TEXT,
    "rolloutPercent" INTEGER DEFAULT 100,
    "audienceFilter" JSONB,

    CONSTRAINT "RouteDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteTemplate" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "routeDirectionId" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "name" TEXT,
    "nameCN" TEXT,
    "nameEN" TEXT,
    "dayPlans" JSONB NOT NULL,
    "defaultPacePreference" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarCityPriceDetail" (
    "city" TEXT NOT NULL,
    "starRating" INTEGER NOT NULL,
    "avgPrice" DOUBLE PRECISION,
    "cityStarFactor" DOUBLE PRECISION,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "stdDev" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarCityPriceDetail_pkey" PRIMARY KEY ("city","starRating")
);

-- CreateTable
CREATE TABLE "Trail" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "nameCN" TEXT NOT NULL,
    "nameEN" TEXT,
    "description" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "elevationGainM" DOUBLE PRECISION,
    "elevationLossM" DOUBLE PRECISION,
    "maxElevationM" DOUBLE PRECISION,
    "minElevationM" DOUBLE PRECISION,
    "averageSlope" DOUBLE PRECISION,
    "difficultyLevel" TEXT,
    "equivalentDistanceKm" DOUBLE PRECISION,
    "fatigueScore" DOUBLE PRECISION,
    "gpxData" JSONB,
    "gpxFileUrl" TEXT,
    "bounds" JSONB,
    "startPlaceId" INTEGER,
    "endPlaceId" INTEGER,
    "metadata" JSONB,
    "source" TEXT,
    "sourceUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "estimatedDurationHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailWaypoint" (
    "id" SERIAL NOT NULL,
    "trailId" INTEGER NOT NULL,
    "placeId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "TrailWaypoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budgetConfig" JSONB,
    "pacingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "status" TEXT DEFAULT 'PLANNING',
    "name" VARCHAR(200),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_suggestion_states" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "first_seen_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_suggestion_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_revisions" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT,
    "user_id" TEXT,
    "parent_revision_id" TEXT,
    "negotiation_session_id" TEXT,
    "alternative_id" TEXT,
    "resolution_patch_summary" TEXT,
    "snapshot" JSONB NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delta_cost_usd" DOUBLE PRECISION,
    "delta_time_minutes" INTEGER,
    "interrupted_items" JSONB,
    "resolution_type" TEXT,

    CONSTRAINT "itinerary_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCollaborator" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripCollection" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripDay" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tripId" TEXT NOT NULL,

    CONSTRAINT "TripDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLike" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripOfflinePack" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripOfflinePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripShare" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "decision_weight_mode" VARCHAR(20) NOT NULL,
    "team_constraints" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationTeamInvite" (
    "id" UUID NOT NULL,
    "team_id" TEXT NOT NULL,
    "invite_token" VARCHAR(64) NOT NULL,
    "inviter_user_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationTeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaborationTeamMember" (
    "id" UUID NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "decision_weight" DOUBLE PRECISION NOT NULL,
    "fitness_level" VARCHAR(20) NOT NULL,
    "experience_level" VARCHAR(20) NOT NULL,
    "personal_weights" JSONB NOT NULL,
    "special_constraints" JSONB,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameCN" TEXT,
    "description" TEXT,
    "theme" TEXT NOT NULL,
    "destination" TEXT,
    "config" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_sub" TEXT,
    "email" TEXT,
    "email_verified" BOOLEAN DEFAULT false,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "platform_role" VARCHAR(32) NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "stripe_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_account_id" TEXT,
    "stripe_customer_id" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "status" VARCHAR(50) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cuisine" JSONB NOT NULL DEFAULT '[]',
    "price_range" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "dietary_restrictions" JSONB NOT NULL DEFAULT '[]',
    "favorite_restaurants" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_bookings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "place_id" TEXT NOT NULL,
    "restaurant_name" TEXT NOT NULL,
    "reservation_date" TIMESTAMP(3) NOT NULL,
    "party_size" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "default_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "preferred_currencies" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hotel_type" JSONB NOT NULL DEFAULT '[]',
    "price_range" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "favorite_hotels" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_bookings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "place_id" TEXT NOT NULL,
    "hotel_name" TEXT NOT NULL,
    "check_in" TIMESTAMP(3) NOT NULL,
    "check_out" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "room_type" TEXT,
    "status" VARCHAR(50) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "default_target_language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "preferred_languages" JSONB NOT NULL DEFAULT '[]',
    "auto_detect" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preferred_styles" JSONB NOT NULL DEFAULT '[]',
    "preferred_colors" JSONB NOT NULL DEFAULT '[]',
    "preferred_orientations" JSONB NOT NULL DEFAULT '[]',
    "favorite_images" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_feature_flags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_feature_flags" (
    "id" UUID NOT NULL,
    "feature" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_airlines" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_airlines_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_coastlines" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_coastlines_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_country" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_country_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_dem_cities_merged" (
    "rid" INTEGER,
    "rast" raster,
    "filename" TEXT
);

-- CreateTable
CREATE TABLE "geo_dem_global" (
    "rid" SERIAL NOT NULL,
    "rast" raster,
    "filename" TEXT,

    CONSTRAINT "geo_dem_global_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "geo_dem_global_tid" (
    "rid" SERIAL NOT NULL,
    "rast" raster,
    "filename" TEXT,

    CONSTRAINT "geo_dem_global_tid_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "geo_dem_xizang" (
    "rid" SERIAL NOT NULL,
    "rast" raster,
    "filename" TEXT,

    CONSTRAINT "geo_dem_xizang_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "geo_dem_iceland_20m" (
    "rid" SERIAL NOT NULL,
    "rast" raster,
    "filename" TEXT,

    CONSTRAINT "geo_dem_iceland_20m_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "geo_mountains_standard" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_mountains_standard_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_mountains_standard_300" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_mountains_standard_300_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_ports" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_ports_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_railways" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_railways_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_rivers_line" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_rivers_line_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_roads" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_roads_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "geo_water_poly" (
    "gid" SERIAL NOT NULL,
    "geom" geometry,
    "properties" JSONB,

    CONSTRAINT "geo_water_poly_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "poi_canonical" (
    "poi_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(50) NOT NULL DEFAULT 'OSM',
    "source_key" VARCHAR(100) NOT NULL,
    "name_default" VARCHAR(500),
    "name_i18n" JSONB,
    "category" VARCHAR(50) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geom" geometry,
    "address" TEXT,
    "opening_hours" VARCHAR(200),
    "phone" VARCHAR(50),
    "website" VARCHAR(500),
    "tags_slim" JSONB,
    "fetched_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "region_key" VARCHAR(50),
    "region_name" VARCHAR(100),
    "region_center" JSONB,
    "altitude_hint" INTEGER,

    CONSTRAINT "poi_canonical_pkey" PRIMARY KEY ("poi_id")
);

-- CreateTable
CREATE TABLE "poi_osm_raw" (
    "id" SERIAL NOT NULL,
    "osm_type" VARCHAR(10) NOT NULL,
    "osm_id" BIGINT NOT NULL,
    "geom" geometry,
    "tags" JSONB NOT NULL,
    "version" INTEGER,
    "timestamp" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "region_key" VARCHAR(50),
    "region_name" VARCHAR(100),
    "region_center" JSONB,

    CONSTRAINT "poi_osm_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postgres_log" (
    "log_time" TIMESTAMPTZ(3),
    "user_name" TEXT,
    "database_name" TEXT,
    "process_id" INTEGER,
    "connection_from" TEXT,
    "session_id" TEXT NOT NULL,
    "session_line_num" BIGINT NOT NULL,
    "command_tag" TEXT,
    "session_start_time" TIMESTAMPTZ(6),
    "virtual_transaction_id" TEXT,
    "transaction_id" BIGINT,
    "error_severity" TEXT,
    "sql_state_code" TEXT,
    "message" TEXT,
    "detail" TEXT,
    "hint" TEXT,
    "internal_query" TEXT,
    "internal_query_pos" INTEGER,
    "context" TEXT,
    "query" TEXT,
    "query_pos" INTEGER,
    "location" TEXT,
    "application_name" TEXT,
    "backend_type" TEXT,
    "leader_pid" INTEGER,
    "query_id" BIGINT
);

-- CreateTable
CREATE TABLE "decision_logs" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "country_code" VARCHAR(2),
    "route_direction_id" VARCHAR(255),
    "persona" VARCHAR(20) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "decision_source" VARCHAR(20) NOT NULL,
    "explanation" TEXT NOT NULL,
    "reason_codes" TEXT[],
    "evidence_refs" TEXT[],
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "decision_stage" VARCHAR(20) NOT NULL,
    "alignment_score" DOUBLE PRECISION,
    "available_options" JSONB,
    "confidence_level" DOUBLE PRECISION,
    "system_recommendation" JSONB,
    "user_choice" JSONB,
    "user_reasoning" TEXT,

    CONSTRAINT "decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_outcomes" (
    "id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "expected_outcome" JSONB NOT NULL,
    "actual_outcome" JSONB NOT NULL,
    "deviation" JSONB NOT NULL,
    "user_satisfaction" DOUBLE PRECISION,
    "user_feedback" TEXT,
    "learning_signals" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_travel_profile" (
    "userId" UUID NOT NULL,
    "pace_preference" VARCHAR(20),
    "altitude_tolerance" VARCHAR(20),
    "risk_tolerance" VARCHAR(20),
    "travel_philosophy" VARCHAR(20),
    "preferred_route_types" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" VARCHAR(20) NOT NULL DEFAULT 'inferred',
    "extended_profile" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_travel_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "route_direction_decision" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trip_id" UUID,
    "country_code" VARCHAR(10) NOT NULL,
    "month" INTEGER NOT NULL,
    "selected_route_direction_id" INTEGER NOT NULL,
    "rejected_route_direction_ids" INTEGER[],
    "key_constraints" JSONB NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_direction_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_direction_health" (
    "route_direction_id" INTEGER NOT NULL,
    "country_code" VARCHAR(10) NOT NULL,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "success_runs" INTEGER NOT NULL DEFAULT 0,
    "failure_runs" INTEGER NOT NULL DEFAULT 0,
    "common_failure_reasons" TEXT[],
    "common_repairs" TEXT[],
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_direction_health_pkey" PRIMARY KEY ("route_direction_id","country_code")
);

-- CreateTable
CREATE TABLE "trip_outcome_feedback" (
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "overall_success" BOOLEAN NOT NULL,
    "fatigue_level" INTEGER,
    "satisfaction" INTEGER,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "failure_points" TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_outcome_feedback_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "flywheel_decision_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "decision_log_id" UUID,
    "context_snapshot" JSONB NOT NULL,
    "utility_weights" JSONB NOT NULL,
    "candidate_plans" JSONB,
    "selected_plan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_behavior_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "plan_id" TEXT,
    "event_type" VARCHAR(50) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "delta_distance" DOUBLE PRECISION,
    "delta_elevation" DOUBLE PRECISION,
    "delta_time" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_behavior_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_outcomes" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subjective_feedback" JSONB,
    "objective_execution" JSONB,
    "failure_signals" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_decisions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "trip_id" UUID,
    "region" VARCHAR(120),
    "context_key" VARCHAR(80),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" JSONB NOT NULL,

    CONSTRAINT "shadow_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_consensus_latches" (
    "id" UUID NOT NULL,
    "context_key" VARCHAR(80) NOT NULL,
    "state" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flywheel_consensus_latches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_parameter_sets" (
    "id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "scope_id" TEXT,
    "training_data_range" JSONB NOT NULL,
    "metrics" JSONB,
    "weights" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_parameter_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flywheel_user_parameter_bindings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parameter_set_id" UUID NOT NULL,
    "parameter_version" VARCHAR(50) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flywheel_user_parameter_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_runs" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "user_id" UUID,
    "user_query" TEXT NOT NULL,
    "planning_phase" VARCHAR(50) NOT NULL,
    "current_agent" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "trip_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_attempts" (
    "id" UUID NOT NULL,
    "trip_run_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "plan_outline" TEXT,
    "open_questions" TEXT[],
    "constraints_assumed" TEXT[],
    "next_actions" TEXT[],
    "failure_notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "result_summary" TEXT,
    "artifacts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "trip_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_files" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "filepath" VARCHAR(500) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "sub_type" VARCHAR(64),
    "version" VARCHAR(20) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
    "credibility_score" DOUBLE PRECISION NOT NULL,
    "data_sources" TEXT[],
    "country_code" VARCHAR(16),
    "source" VARCHAR(500),
    "admin_metadata" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "chunk_id" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "section" VARCHAR(100),
    "credibility_score" DOUBLE PRECISION NOT NULL,
    "keywords" TEXT[],
    "file_id" UUID NOT NULL,
    "metadata" JSONB,
    "token_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "last_verified_at" TIMESTAMPTZ(6),
    "embedding" vector,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_indices" (
    "id" UUID NOT NULL,
    "keyword" VARCHAR(100) NOT NULL,
    "files" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_indices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_history" (
    "id" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "retrieved_chunks" JSONB NOT NULL,
    "answer" TEXT,
    "avg_credibility" DOUBLE PRECISION,
    "execution_time_ms" INTEGER NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_evidence" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "rule_type" VARCHAR(50) NOT NULL,
    "rule_data" JSONB NOT NULL,
    "source" VARCHAR(50) NOT NULL DEFAULT 'RAG_EXTRACTED',
    "source_url" VARCHAR(500),
    "confidence" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified" TIMESTAMP(3),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,

    CONSTRAINT "compliance_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_insight" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "region" VARCHAR(100),
    "tags" TEXT[],
    "content" TEXT NOT NULL,
    "evidence_snippets" TEXT[],
    "confidence" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "source" VARCHAR(255),
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "local_insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255),
    "message" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_message_images" (
    "id" UUID NOT NULL,
    "contact_message_id" UUID NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_message_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_checklist_status" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "finding_id" VARCHAR(255) NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_checklist_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_finding_marks" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "finding_id" VARCHAR(255) NOT NULL,
    "mark_type" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "reminder_date" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_finding_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_capability_pack_items" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "rule_id" VARCHAR(255) NOT NULL,
    "source_pack_type" VARCHAR(50) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "category" VARCHAR(50),
    "tasks" JSONB,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_capability_pack_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_packing_list_items" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "item_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR(20),
    "priority" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "source_finding_id" VARCHAR(255),
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_packing_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "thread_id" VARCHAR(255) NOT NULL,
    "agent_run_id" VARCHAR(255),
    "tool_call_id" VARCHAR(255),
    "skill_name" VARCHAR(100) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "risk_level" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decision_note" TEXT,
    "handled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hazard_zones" (
    "id" UUID NOT NULL,
    "zone_id" VARCHAR(100) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "geom" geography,
    "seasonality" JSONB,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hazard_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "consent_text" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" UUID NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "auto_delete" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validated_trajectories" (
    "id" UUID NOT NULL,
    "trajectory_id" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "trip_id" UUID,
    "validation_status" VARCHAR(20) NOT NULL,
    "validation_score" DOUBLE PRECISION NOT NULL,
    "validation_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plan" JSONB NOT NULL,
    "decision_trace" JSONB NOT NULL,
    "research_data" JSONB NOT NULL,
    "gate_result" JSONB NOT NULL,
    "compliance_result" JSONB NOT NULL,
    "total_reward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_signals" JSONB NOT NULL DEFAULT '[]',
    "user_approval" VARCHAR(20),
    "execution_result" JSONB,
    "model_version" VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    "country_code" VARCHAR(2),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_for_training" BOOLEAN NOT NULL DEFAULT false,
    "training_batch_id" VARCHAR(255),
    "used_for_training_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validated_trajectories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_plans" (
    "id" UUID NOT NULL,
    "trip_id" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "plan_state" JSONB NOT NULL,
    "ui_output" JSONB,
    "summary" JSONB,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_decision_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "inputs_summary" JSONB NOT NULL DEFAULT '{}',
    "outputs_summary" JSONB NOT NULL DEFAULT '{}',
    "evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "retrieval_trace" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_knowledge_gaps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "query" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "attempted_methods" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "needs_index" BOOLEAN NOT NULL DEFAULT true,
    "indexed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_drafts" (
    "id" UUID NOT NULL,
    "draft_id" VARCHAR(255) NOT NULL,
    "workflow_id" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    "step_draft_id" VARCHAR(255),
    "step_draft_data" JSONB,
    "execution_result_id" VARCHAR(255),
    "execution_result_data" JSONB,
    "user_mode" VARCHAR(20) NOT NULL DEFAULT 'toc',
    "decision_count" INTEGER NOT NULL DEFAULT 0,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "debug_info" JSONB,

    CONSTRAINT "decision_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_steps" (
    "id" UUID NOT NULL,
    "decision_draft_id" UUID NOT NULL,
    "step_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "decision_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "inputs" JSONB NOT NULL DEFAULT '[]',
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "decision_log" JSONB NOT NULL DEFAULT '[]',
    "step_draft_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guardian_review" JSONB,
    "user_feedback" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_draft_versions" (
    "id" UUID NOT NULL,
    "version_id" VARCHAR(255) NOT NULL,
    "workflow_id" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "decision_draft_data" JSONB NOT NULL,
    "step_draft_data" JSONB NOT NULL,
    "execution_result_data" JSONB,
    "diff_data" JSONB,
    "created_by" VARCHAR(255) NOT NULL DEFAULT 'system',
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_draft_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_clarification_configs" (
    "id" UUID NOT NULL,
    "destination_code" VARCHAR(2) NOT NULL,
    "destination_name" VARCHAR(255) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" VARCHAR(255),
    "updated_by" VARCHAR(255),

    CONSTRAINT "destination_clarification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_versions" (
    "id" UUID NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "model_type" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "performance" JSONB,
    "training_data" JSONB,
    "deployed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_monitors" (
    "id" UUID NOT NULL,
    "data_source" VARCHAR(100) NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "consistency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "timeliness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "traceability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "last_verified" TIMESTAMP(3) NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_quality_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_alerts" (
    "id" UUID NOT NULL,
    "monitor_id" UUID,
    "geographic_monitor_id" UUID,
    "severity" VARCHAR(20) NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "acknowledged_by" VARCHAR(255),
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_quality_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geographic_data_quality_monitors" (
    "id" UUID NOT NULL,
    "data_source" VARCHAR(100) NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "spatial_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "coordinate_system_consistency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "spatial_completeness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "spatial_consistency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "completeness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "consistency" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "timeliness" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "traceability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "overall_score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "query_latency_p50" DOUBLE PRECISION,
    "query_latency_p95" DOUBLE PRECISION,
    "query_latency_p99" DOUBLE PRECISION,
    "query_success_rate" DOUBLE PRECISION DEFAULT 1.0,
    "coverage_rate" DOUBLE PRECISION DEFAULT 1.0,
    "missing_regions" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "last_verified" TIMESTAMP(3) NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geographic_data_quality_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_learning_results" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255),
    "trip_id" UUID,
    "event_type" VARCHAR(50) NOT NULL,
    "block_key" VARCHAR(100) NOT NULL,
    "block_type" VARCHAR(50) NOT NULL,
    "importance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "relevance_score" DOUBLE PRECISION,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "positive_feedback_count" INTEGER NOT NULL DEFAULT 0,
    "negative_feedback_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "phase" VARCHAR(50),
    "agent" VARCHAR(50),
    "user_query" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_learning_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN DEFAULT true,
    "tools" JSONB DEFAULT '[]',
    "category" VARCHAR(50),
    "auth_required" BOOLEAN DEFAULT false,
    "default_enabled" BOOLEAN DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_world_model_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(50) NOT NULL,
    "parameters" JSONB NOT NULL,
    "trained_on" TIMESTAMP(3) NOT NULL,
    "performance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptive_world_model_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_score" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contribution_id" UUID NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "completeness" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "consistency" DOUBLE PRECISION NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL,
    "factors" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "expert_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "verification_result" VARCHAR(20) NOT NULL,
    "comments" TEXT,
    "quality_score" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION DEFAULT 0.9,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expert_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "failure_risk_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_direction_id" UUID NOT NULL,
    "trip_id" UUID,
    "prediction_date" DATE NOT NULL,
    "predicted_risks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "failure_risk_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_anomalies" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "anomaly_type" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "description_zh" TEXT,
    "related_trip_ids" VARCHAR[],
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" VARCHAR(50),
    "notified" BOOLEAN DEFAULT false,
    "notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "fitness_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_calibration_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "old_max_daily_ascent_m" INTEGER NOT NULL,
    "new_max_daily_ascent_m" INTEGER NOT NULL,
    "old_rolling_ascent_3days_m" INTEGER NOT NULL,
    "new_rolling_ascent_3days_m" INTEGER NOT NULL,
    "calibration_factor" DECIMAL(4,2) NOT NULL,
    "calibration_source" VARCHAR(50) NOT NULL,
    "feedback_count" INTEGER NOT NULL DEFAULT 0,
    "confidence_level" VARCHAR(20),
    "calibrated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_calibration_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_experiment_events" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "experiment_id" VARCHAR(100) NOT NULL,
    "variant" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_experiment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_questionnaire_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "weekly_exercise" INTEGER NOT NULL,
    "longest_hike" INTEGER NOT NULL,
    "elevation_experience" INTEGER NOT NULL,
    "age_group" VARCHAR(20) NOT NULL,
    "fitness_score" INTEGER,
    "fitness_level" VARCHAR(20),
    "age_modifier" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_questionnaire_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_reports" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "report_type" VARCHAR(50) NOT NULL DEFAULT 'PERIODIC',
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "period_days" INTEGER NOT NULL,
    "total_trips" INTEGER,
    "avg_fatigue_index" DECIMAL(4,2),
    "avg_effort_rating" DECIMAL(3,2),
    "completion_rate" DECIMAL(4,3),
    "start_max_ascent_m" INTEGER,
    "end_max_ascent_m" INTEGER,
    "change_percent" DECIMAL(5,2),
    "calibration_count" INTEGER,
    "trend" VARCHAR(50),
    "trend_confidence" DECIMAL(3,2),
    "anomaly_count" INTEGER DEFAULT 0,
    "recommendations" TEXT[],
    "recommendations_zh" TEXT[],
    "full_report" JSONB,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_trend_cache" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "period_days" INTEGER NOT NULL,
    "trend" VARCHAR(50) NOT NULL,
    "confidence" DECIMAL(3,2),
    "slope" DECIMAL(8,6),
    "data_points" INTEGER,
    "summary" TEXT,
    "summary_zh" TEXT,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fitness_trend_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_poi_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poi_id" UUID NOT NULL,
    "current_status" VARCHAR(20) NOT NULL,
    "wait_time" INTEGER,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_poi_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_road_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "road_id" VARCHAR(100) NOT NULL,
    "current_status" VARCHAR(20) NOT NULL,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) NOT NULL,
    "confidence" DOUBLE PRECISION DEFAULT 1.0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_road_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_weather_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "region" VARCHAR(100) NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "impact_description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_weather_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_status_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "road_id" VARCHAR(100) NOT NULL,
    "prediction_date" DATE NOT NULL,
    "predicted_status" VARCHAR(20) NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_status_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_difficulty_correction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "route_direction_id" UUID NOT NULL,
    "actual_difficulty" DOUBLE PRECISION,
    "estimated_difficulty" DOUBLE PRECISION,
    "correction_factor" DOUBLE PRECISION,
    "user_count" INTEGER DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_difficulty_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_fitness_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "planned_fatigue_index" DECIMAL(4,2) NOT NULL,
    "actual_effort_rating" INTEGER NOT NULL,
    "completed_as_planned" BOOLEAN NOT NULL DEFAULT true,
    "adjustments_made" JSONB DEFAULT '[]',
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ(6),
    "feedback_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_fitness_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_capability_learning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "learned_capability" JSONB NOT NULL,
    "prediction_accuracy" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_capability_learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_contribution" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "target_id" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL,
    "quality_score" DOUBLE PRECISION,
    "verified_by_expert" BOOLEAN DEFAULT false,
    "expert_verification_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feedback_type" VARCHAR(50) NOT NULL,
    "feedback_data" JSONB NOT NULL,
    "quality_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fitness_profile_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "max_daily_ascent_m" INTEGER NOT NULL,
    "rolling_ascent_3days_m" INTEGER NOT NULL,
    "max_slope_pct" INTEGER NOT NULL,
    "fitness_score" INTEGER,
    "fitness_level" VARCHAR(20),
    "confidence_level" VARCHAR(20),
    "assessment_source" VARCHAR(50),
    "age_group" VARCHAR(20),
    "age_modifier" DECIMAL(3,2),
    "completed_trip_count" INTEGER DEFAULT 0,
    "snapshot_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_fitness_profile_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_activities" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "activity_id" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(500),
    "activity_type" VARCHAR(50) NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6),
    "distance_m" DECIMAL(12,2),
    "elevation_gain_m" DECIMAL(10,2),
    "elevation_loss_m" DECIMAL(10,2),
    "moving_time_seconds" INTEGER,
    "elapsed_time_seconds" INTEGER,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "avg_pace" DECIMAL(6,2),
    "calories" INTEGER,
    "start_lat" DECIMAL(10,7),
    "start_lng" DECIMAL(10,7),
    "end_lat" DECIMAL(10,7),
    "end_lng" DECIMAL(10,7),
    "polyline" TEXT,
    "raw_data" JSONB,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wearable_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_connections" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "scope" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "athlete_id" VARCHAR(100),
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMPTZ(6),

    CONSTRAINT "wearable_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wearable_fitness_estimates" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "estimated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_max_daily_ascent_m" INTEGER NOT NULL,
    "estimated_rolling_ascent_3days_m" INTEGER NOT NULL,
    "confidence_score" DECIMAL(3,2) NOT NULL,
    "activity_count" INTEGER NOT NULL,
    "data_range_days" INTEGER NOT NULL,
    "max_single_day_ascent_m" INTEGER,
    "max_single_day_distance_km" DECIMAL(6,2),
    "longest_moving_time_hours" DECIMAL(5,2),

    CONSTRAINT "wearable_fitness_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_prediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "region" VARCHAR(100) NOT NULL,
    "prediction_date" DATE NOT NULL,
    "predicted_weather" JSONB NOT NULL,
    "accessibility_score" DOUBLE PRECISION,
    "risk_factors" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_model_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version_id" VARCHAR(100) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "world_model" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "is_active" BOOLEAN DEFAULT false,
    "performance_metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_status_realtime" (
    "id" UUID NOT NULL,
    "road_id" VARCHAR(10) NOT NULL,
    "road_name" VARCHAR(255),
    "current_status" VARCHAR(20) NOT NULL,
    "status_message" TEXT,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "data_source" VARCHAR(50) NOT NULL,
    "api_response" JSONB,
    "hazards" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "seasonal_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "road_status_realtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_forecast_realtime" (
    "id" UUID NOT NULL,
    "region_key" VARCHAR(50) NOT NULL,
    "region_name" VARCHAR(255) NOT NULL,
    "location" geography,
    "forecast_time" TIMESTAMPTZ(6) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "temperature" DOUBLE PRECISION,
    "wind_speed" DOUBLE PRECISION,
    "wind_direction" INTEGER,
    "precipitation" DOUBLE PRECISION,
    "visibility" DOUBLE PRECISION,
    "conditions" VARCHAR(100),
    "weather_code" VARCHAR(20),
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "hazards" JSONB NOT NULL DEFAULT '[]',
    "data_source" VARCHAR(50) NOT NULL,
    "api_response" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "weather_forecast_realtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_decision_weights" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "weights" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "learning_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "total_feedback" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_decision_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_learning_history" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255),
    "weights_before" JSONB NOT NULL,
    "weights_after" JSONB NOT NULL,
    "feedback_data" JSONB,
    "learning_method" VARCHAR(50),
    "learning_rate" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "utility_before" DOUBLE PRECISION,
    "utility_after" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_learning_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dso_snapshots" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "version" INTEGER NOT NULL,
    "phase" VARCHAR(50) NOT NULL,
    "dso_data" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "lyapunov_value" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dso_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rlhf_feedback_records" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255) NOT NULL,
    "feedback_type" VARCHAR(50) NOT NULL,
    "feedback_data" JSONB NOT NULL,
    "weights_at_time" JSONB NOT NULL,
    "utility_at_time" DOUBLE PRECISION NOT NULL,
    "context_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rlhf_feedback_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_convergence_logs" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "round" INTEGER NOT NULL,
    "utility" DOUBLE PRECISION NOT NULL,
    "optimal_utility" DOUBLE PRECISION NOT NULL,
    "regret" DOUBLE PRECISION NOT NULL,
    "cumulative_regret" DOUBLE PRECISION NOT NULL,
    "theoretical_bound" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_convergence_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cbr_case_aggregates" (
    "id" UUID NOT NULL,
    "signature_hash" VARCHAR(64) NOT NULL,
    "conflict_type" VARCHAR(16) NOT NULL,
    "primary_violation_type" VARCHAR(128),
    "region_id" VARCHAR(64),
    "month" INTEGER,
    "relaxation_types_json" JSONB,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "late_accept_count" INTEGER NOT NULL DEFAULT 0,
    "late_accept_rate" DOUBLE PRECISION,
    "avg_wall_hit_latency_ms" DOUBLE PRECISION,
    "avg_wall_hit_event_span" DOUBLE PRECISION,
    "evidence_anchors" JSONB,
    "precedent_summary_latest" TEXT,
    "last_case_id" VARCHAR(255),
    "last_request_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cbr_case_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_intelligence_logs" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(255),
    "dominant_cid" VARCHAR(128),
    "graph_json" JSONB NOT NULL,
    "efficiency_metrics" JSONB NOT NULL,
    "persuasion_latency_event_span" INTEGER,
    "oscillation_escalated" BOOLEAN NOT NULL DEFAULT false,
    "hard_truth_is_hard" BOOLEAN NOT NULL DEFAULT false,
    "has_conversion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_intelligence_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_rule_configs" (
    "id" UUID NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "handler_id" VARCHAR(255) NOT NULL,
    "params" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "decision_rule_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_financial_holds" (
    "hold_id" VARCHAR(255) NOT NULL,
    "action_id" VARCHAR(255) NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255) NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" VARCHAR(8),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_financial_holds_pkey" PRIMARY KEY ("hold_id")
);

-- CreateTable
CREATE TABLE "agent_action_logs" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(255) NOT NULL,
    "trip_id" VARCHAR(255) NOT NULL,
    "action_id" VARCHAR(255) NOT NULL,
    "action_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "idempotency_key" VARCHAR(255),
    "payload" JSONB,
    "last_error" TEXT,
    "committed_at" TIMESTAMPTZ(6),
    "side_effect_done_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activity_logs" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(255),
    "path" VARCHAR(512) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_saga_side_effect_replays" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agent_action_log_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255),

    CONSTRAINT "admin_saga_side_effect_replays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_quality_marks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" VARCHAR(255),
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(255) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "comment" TEXT,
    "meta" JSONB,

    CONSTRAINT "admin_quality_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_domain_budgets" (
    "account_id" VARCHAR(191) NOT NULL,
    "currency" VARCHAR(16) NOT NULL DEFAULT 'USD',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "held" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_domain_budgets_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "physical_domain_inventory_items" (
    "id" VARCHAR(191) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "availability" VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE',
    "lockable" BOOLEAN NOT NULL DEFAULT true,
    "hold_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "physical_domain_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_domain_constraint_configs" (
    "rule_id" VARCHAR(191) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION,
    "description" TEXT,
    "params" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "physical_domain_constraint_configs_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "physical_domain_data_source_configs" (
    "source_id" VARCHAR(191) NOT NULL,
    "provider" VARCHAR(191) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "base_url" VARCHAR(1024),
    "fallback_strategy" VARCHAR(191),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "physical_domain_data_source_configs_pkey" PRIMARY KEY ("source_id")
);

-- CreateTable
CREATE TABLE "spatial_domain_pois" (
    "id" VARCHAR(191) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "coordinates" JSONB NOT NULL,
    "time_windows" JSONB,
    "rules" JSONB,
    "capacity_limit" INTEGER,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spatial_domain_pois_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spatial_domain_segments" (
    "id" VARCHAR(191) NOT NULL,
    "from_poi_id" VARCHAR(191) NOT NULL,
    "to_poi_id" VARCHAR(191) NOT NULL,
    "segment_type" VARCHAR(32) NOT NULL,
    "gradient" JSONB,
    "road_condition" JSONB,
    "seasonal_closures" JSONB,
    "rules" JSONB,
    "evidence" JSONB,
    "latest_status" JSONB,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spatial_domain_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runtime_replay_anchors" (
    "id" UUID NOT NULL,
    "snapshot_id" VARCHAR(128) NOT NULL,
    "query_id" VARCHAR(255) NOT NULL,
    "admission_path" VARCHAR(32) NOT NULL DEFAULT 'FRESH_FINALIZE',
    "dedup_request_hash" VARCHAR(64),
    "phi_digest" VARCHAR(128) NOT NULL,
    "certificate_digest" VARCHAR(128),
    "artifact_refs" JSONB NOT NULL,
    "schema_version" VARCHAR(64) NOT NULL DEFAULT 'runtime/persistence/v1',
    "created_at_ms" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partial_recompute_scope" JSONB,
    "artifact_evolution" JSONB,

    CONSTRAINT "agent_runtime_replay_anchors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_bus_event_logs" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "subType" VARCHAR(64) NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,
    "cityKey" VARCHAR(32),
    "placeId" INTEGER,
    "payload" JSONB NOT NULL,
    "raw" JSONB NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_bus_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "City_countryCode_idx" ON "City"("countryCode");

-- CreateIndex
CREATE INDEX "City_nameCN_idx" ON "City"("nameCN");

-- CreateIndex
CREATE INDEX "City_nameEN_idx" ON "City"("nameEN");

-- CreateIndex
CREATE INDEX "City_name_idx" ON "City"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CountryProfile_isoCode_key" ON "CountryProfile"("isoCode");

-- CreateIndex
CREATE UNIQUE INDEX "DayOfWeekFactor_dayOfWeek_key" ON "DayOfWeekFactor"("dayOfWeek");

-- CreateIndex
CREATE INDEX "FlightPriceDetail_originCity_destinationCity_idx" ON "FlightPriceDetail"("originCity", "destinationCity");

-- CreateIndex
CREATE INDEX "FlightPriceDetail_routeId_month_dayOfWeek_idx" ON "FlightPriceDetail"("routeId", "month", "dayOfWeek");

-- CreateIndex
CREATE INDEX "FlightPriceDetail_routeId_month_idx" ON "FlightPriceDetail"("routeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FlightPriceDetail_routeId_month_dayOfWeek_key" ON "FlightPriceDetail"("routeId", "month", "dayOfWeek");

-- CreateIndex
CREATE INDEX "FlightPriceReference_countryCode_idx" ON "FlightPriceReference"("countryCode");

-- CreateIndex
CREATE INDEX "FlightPriceReference_countryCode_originCity_idx" ON "FlightPriceReference"("countryCode", "originCity");

-- CreateIndex
CREATE INDEX "HotelPriceDetail_city_idx" ON "HotelPriceDetail"("city");

-- CreateIndex
CREATE INDEX "HotelWideData_Quarterly_city_idx" ON "HotelWideData_Quarterly"("city");

-- CreateIndex
CREATE INDEX "HotelWideData_Quarterly_city_starRating_idx" ON "HotelWideData_Quarterly"("city", "starRating");

-- CreateIndex
CREATE INDEX "HotelWideData_Quarterly_starRating_idx" ON "HotelWideData_Quarterly"("starRating");

-- CreateIndex
CREATE INDEX "ItineraryItem_costCategory_idx" ON "ItineraryItem"("costCategory");

-- CreateIndex
CREATE INDEX "ItineraryItem_isPaid_idx" ON "ItineraryItem"("isPaid");

-- CreateIndex
CREATE INDEX "ItineraryItem_bookingStatus_idx" ON "ItineraryItem"("bookingStatus");

-- CreateIndex
CREATE INDEX "ItineraryItem_tripDayId_order_idx" ON "ItineraryItem"("tripDayId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Place_uuid_key" ON "Place"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Place_googlePlaceId_key" ON "Place"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Place_metadata_idx" ON "Place" USING GIN ("metadata" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "Place_last_verified_at_idx" ON "Place"("last_verified_at");

-- CreateIndex
CREATE INDEX "Place_data_freshness_idx" ON "Place"("data_freshness");

-- CreateIndex
CREATE INDEX "Place_districtId_idx" ON "Place"("districtId");

-- CreateIndex
CREATE INDEX "PlaceEdge_fromPlaceId_idx" ON "PlaceEdge"("fromPlaceId");

-- CreateIndex
CREATE INDEX "PlaceEdge_toPlaceId_idx" ON "PlaceEdge"("toPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceEdge_fromPlaceId_toPlaceId_key" ON "PlaceEdge"("fromPlaceId", "toPlaceId");

-- CreateIndex
CREATE INDEX "District_cityId_idx" ON "District"("cityId");

-- CreateIndex
CREATE INDEX "CrowdCurve_placeId_idx" ON "CrowdCurve"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "CrowdCurve_placeId_hour_dayOfWeek_key" ON "CrowdCurve"("placeId", "hour", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "RailPassProfile_tripId_key" ON "RailPassProfile"("tripId");

-- CreateIndex
CREATE INDEX "RailPassProfile_tripId_idx" ON "RailPassProfile"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "RailSegment_itineraryItemId_key" ON "RailSegment"("itineraryItemId");

-- CreateIndex
CREATE INDEX "RailSegment_departureDate_idx" ON "RailSegment"("departureDate");

-- CreateIndex
CREATE INDEX "RailSegment_itineraryItemId_idx" ON "RailSegment"("itineraryItemId");

-- CreateIndex
CREATE INDEX "RailSegment_railPassProfileId_idx" ON "RailSegment"("railPassProfileId");

-- CreateIndex
CREATE INDEX "RawAttractionData_level_idx" ON "RawAttractionData"("level");

-- CreateIndex
CREATE INDEX "RawAttractionData_processed_idx" ON "RawAttractionData"("processed");

-- CreateIndex
CREATE INDEX "RawAttractionData_province_idx" ON "RawAttractionData"("province");

-- CreateIndex
CREATE INDEX "RawAttractionData_province_level_idx" ON "RawAttractionData"("province", "level");

-- CreateIndex
CREATE INDEX "RawHotelData_Slim_brand_idx" ON "RawHotelData_Slim"("brand");

-- CreateIndex
CREATE INDEX "RawHotelData_Slim_city_brand_idx" ON "RawHotelData_Slim"("city", "brand");

-- CreateIndex
CREATE INDEX "RawHotelData_Slim_city_district_idx" ON "RawHotelData_Slim"("city", "district");

-- CreateIndex
CREATE INDEX "RawHotelData_Slim_city_idx" ON "RawHotelData_Slim"("city");

-- CreateIndex
CREATE INDEX "RawTrainStationData_city_idx" ON "RawTrainStationData"("city");

-- CreateIndex
CREATE INDEX "RawTrainStationData_nature_idx" ON "RawTrainStationData"("nature");

-- CreateIndex
CREATE INDEX "RawTrainStationData_processed_idx" ON "RawTrainStationData"("processed");

-- CreateIndex
CREATE INDEX "RawTrainStationData_province_city_idx" ON "RawTrainStationData"("province", "city");

-- CreateIndex
CREATE INDEX "RawTrainStationData_province_idx" ON "RawTrainStationData"("province");

-- CreateIndex
CREATE INDEX "RawTrainStationData_railwayBureau_idx" ON "RawTrainStationData"("railwayBureau");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessPack_packId_key" ON "ReadinessPack"("packId");

-- CreateIndex
CREATE INDEX "ReadinessPack_countryCode_idx" ON "ReadinessPack"("countryCode");

-- CreateIndex
CREATE INDEX "ReadinessPack_countryCode_isActive_idx" ON "ReadinessPack"("countryCode", "isActive");

-- CreateIndex
CREATE INDEX "ReadinessPack_destinationId_idx" ON "ReadinessPack"("destinationId");

-- CreateIndex
CREATE INDEX "ReadinessPack_isActive_idx" ON "ReadinessPack"("isActive");

-- CreateIndex
CREATE INDEX "ReadinessPack_packId_idx" ON "ReadinessPack"("packId");

-- CreateIndex
CREATE INDEX "ReadinessPack_display_name_cn_idx" ON "ReadinessPack"("display_name_cn");

-- CreateIndex
CREATE INDEX "ReadinessPack_display_name_en_idx" ON "ReadinessPack"("display_name_en");

-- CreateIndex
CREATE INDEX "trip_readiness_decision_trip_id_idx" ON "trip_readiness_decision"("trip_id");

-- CreateIndex
CREATE INDEX "trip_readiness_decision_rule_id_idx" ON "trip_readiness_decision"("rule_id");

-- CreateIndex
CREATE INDEX "trip_readiness_decision_pack_id_idx" ON "trip_readiness_decision"("pack_id");

-- CreateIndex
CREATE INDEX "trip_readiness_decision_user_id_idx" ON "trip_readiness_decision"("user_id");

-- CreateIndex
CREATE INDEX "trip_readiness_decision_created_at_idx" ON "trip_readiness_decision"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trip_readiness_decision_trip_id_rule_id_key" ON "trip_readiness_decision"("trip_id", "rule_id");

-- CreateIndex
CREATE INDEX "ReservationTask_railPassProfileId_idx" ON "ReservationTask"("railPassProfileId");

-- CreateIndex
CREATE INDEX "ReservationTask_segmentId_idx" ON "ReservationTask"("segmentId");

-- CreateIndex
CREATE INDEX "ReservationTask_status_idx" ON "ReservationTask"("status");

-- CreateIndex
CREATE INDEX "ReservationTask_travelDay_idx" ON "ReservationTask"("travelDay");

-- CreateIndex
CREATE INDEX "route_direction_status_idx" ON "RouteDirection"("status");

-- CreateIndex
CREATE INDEX "idx_route_direction_corridor_geom" ON "RouteDirection" USING GIST ("corridorGeom");

-- CreateIndex
CREATE INDEX "idx_route_direction_country_status" ON "RouteDirection"("countryCode", "status");

-- CreateIndex
CREATE INDEX "idx_route_direction_tags" ON "RouteDirection" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "RouteTemplate_uuid_key" ON "RouteTemplate"("uuid");

-- CreateIndex
CREATE INDEX "RouteTemplate_routeDirectionId_idx" ON "RouteTemplate"("routeDirectionId");

-- CreateIndex
CREATE INDEX "RouteTemplate_routeDirectionId_durationDays_idx" ON "RouteTemplate"("routeDirectionId", "durationDays");

-- CreateIndex
CREATE INDEX "RouteTemplate_isActive_idx" ON "RouteTemplate"("isActive");

-- CreateIndex
CREATE INDEX "StarCityPriceDetail_city_idx" ON "StarCityPriceDetail"("city");

-- CreateIndex
CREATE INDEX "StarCityPriceDetail_city_starRating_idx" ON "StarCityPriceDetail"("city", "starRating");

-- CreateIndex
CREATE INDEX "StarCityPriceDetail_starRating_idx" ON "StarCityPriceDetail"("starRating");

-- CreateIndex
CREATE UNIQUE INDEX "Trail_uuid_key" ON "Trail"("uuid");

-- CreateIndex
CREATE INDEX "Trail_difficultyLevel_idx" ON "Trail"("difficultyLevel");

-- CreateIndex
CREATE INDEX "Trail_endPlaceId_idx" ON "Trail"("endPlaceId");

-- CreateIndex
CREATE INDEX "Trail_source_idx" ON "Trail"("source");

-- CreateIndex
CREATE INDEX "Trail_startPlaceId_idx" ON "Trail"("startPlaceId");

-- CreateIndex
CREATE INDEX "TrailWaypoint_placeId_idx" ON "TrailWaypoint"("placeId");

-- CreateIndex
CREATE INDEX "TrailWaypoint_trailId_idx" ON "TrailWaypoint"("trailId");

-- CreateIndex
CREATE UNIQUE INDEX "TrailWaypoint_trailId_placeId_key" ON "TrailWaypoint"("trailId", "placeId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "trip_suggestion_states_trip_id_status_idx" ON "trip_suggestion_states"("trip_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_suggestion_states_trip_id_suggestion_id_key" ON "trip_suggestion_states"("trip_id", "suggestion_id");

-- CreateIndex
CREATE INDEX "itinerary_revisions_trip_id_created_at_idx" ON "itinerary_revisions"("trip_id", "created_at");

-- CreateIndex
CREATE INDEX "itinerary_revisions_negotiation_session_id_idx" ON "itinerary_revisions"("negotiation_session_id");

-- CreateIndex
CREATE INDEX "itinerary_revisions_parent_revision_id_idx" ON "itinerary_revisions"("parent_revision_id");

-- CreateIndex
CREATE INDEX "itinerary_revisions_trip_id_delta_time_minutes_idx" ON "itinerary_revisions"("trip_id", "delta_time_minutes");

-- CreateIndex
CREATE INDEX "TripCollaborator_tripId_idx" ON "TripCollaborator"("tripId");

-- CreateIndex
CREATE INDEX "TripCollaborator_userId_idx" ON "TripCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripCollaborator_tripId_userId_key" ON "TripCollaborator"("tripId", "userId");

-- CreateIndex
CREATE INDEX "TripCollection_tripId_idx" ON "TripCollection"("tripId");

-- CreateIndex
CREATE INDEX "TripCollection_userId_idx" ON "TripCollection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripCollection_tripId_userId_key" ON "TripCollection"("tripId", "userId");

-- CreateIndex
CREATE INDEX "TripLike_tripId_idx" ON "TripLike"("tripId");

-- CreateIndex
CREATE INDEX "TripLike_userId_idx" ON "TripLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripLike_tripId_userId_key" ON "TripLike"("tripId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripOfflinePack_tripId_key" ON "TripOfflinePack"("tripId");

-- CreateIndex
CREATE INDEX "TripOfflinePack_tripId_idx" ON "TripOfflinePack"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripShare_shareToken_key" ON "TripShare"("shareToken");

-- CreateIndex
CREATE INDEX "TripShare_shareToken_idx" ON "TripShare"("shareToken");

-- CreateIndex
CREATE INDEX "TripShare_tripId_idx" ON "TripShare"("tripId");

-- CreateIndex
CREATE INDEX "CollaborationTeam_type_idx" ON "CollaborationTeam"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationTeamInvite_invite_token_key" ON "CollaborationTeamInvite"("invite_token");

-- CreateIndex
CREATE INDEX "CollaborationTeamInvite_team_id_idx" ON "CollaborationTeamInvite"("team_id");

-- CreateIndex
CREATE INDEX "CollaborationTeamInvite_invite_token_idx" ON "CollaborationTeamInvite"("invite_token");

-- CreateIndex
CREATE INDEX "CollaborationTeamInvite_expires_at_idx" ON "CollaborationTeamInvite"("expires_at");

-- CreateIndex
CREATE INDEX "CollaborationTeamMember_team_id_idx" ON "CollaborationTeamMember"("team_id");

-- CreateIndex
CREATE INDEX "CollaborationTeamMember_user_id_idx" ON "CollaborationTeamMember"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationTeamMember_team_id_user_id_key" ON "CollaborationTeamMember"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "TripTemplate_destination_idx" ON "TripTemplate"("destination");

-- CreateIndex
CREATE INDEX "TripTemplate_isPublic_idx" ON "TripTemplate"("isPublic");

-- CreateIndex
CREATE INDEX "TripTemplate_theme_idx" ON "TripTemplate"("theme");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_google_sub_idx" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_platform_role_idx" ON "users"("platform_role");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_connections_user_id_key" ON "stripe_connections"("user_id");

-- CreateIndex
CREATE INDEX "stripe_connections_user_id_idx" ON "stripe_connections"("user_id");

-- CreateIndex
CREATE INDEX "stripe_connections_stripe_account_id_idx" ON "stripe_connections"("stripe_account_id");

-- CreateIndex
CREATE INDEX "stripe_connections_stripe_customer_id_idx" ON "stripe_connections"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "stripe_connections_is_active_idx" ON "stripe_connections"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_stripe_payment_intent_id_key" ON "payment_intents"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "payment_intents_user_id_idx" ON "payment_intents"("user_id");

-- CreateIndex
CREATE INDEX "payment_intents_stripe_payment_intent_id_idx" ON "payment_intents"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "payment_intents_status_idx" ON "payment_intents"("status");

-- CreateIndex
CREATE INDEX "payment_intents_created_at_idx" ON "payment_intents"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_preferences_user_id_key" ON "restaurant_preferences"("user_id");

-- CreateIndex
CREATE INDEX "restaurant_bookings_user_id_idx" ON "restaurant_bookings"("user_id");

-- CreateIndex
CREATE INDEX "restaurant_bookings_place_id_idx" ON "restaurant_bookings"("place_id");

-- CreateIndex
CREATE INDEX "restaurant_bookings_status_idx" ON "restaurant_bookings"("status");

-- CreateIndex
CREATE INDEX "restaurant_bookings_reservation_date_idx" ON "restaurant_bookings"("reservation_date");

-- CreateIndex
CREATE UNIQUE INDEX "currency_settings_user_id_key" ON "currency_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_preferences_user_id_key" ON "hotel_preferences"("user_id");

-- CreateIndex
CREATE INDEX "hotel_bookings_user_id_idx" ON "hotel_bookings"("user_id");

-- CreateIndex
CREATE INDEX "hotel_bookings_place_id_idx" ON "hotel_bookings"("place_id");

-- CreateIndex
CREATE INDEX "hotel_bookings_status_idx" ON "hotel_bookings"("status");

-- CreateIndex
CREATE INDEX "hotel_bookings_check_in_idx" ON "hotel_bookings"("check_in");

-- CreateIndex
CREATE UNIQUE INDEX "translation_settings_user_id_key" ON "translation_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "image_preferences_user_id_key" ON "image_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_feature_flags_feature_enabled_idx" ON "user_feature_flags"("feature", "enabled");

-- CreateIndex
CREATE INDEX "user_feature_flags_user_id_idx" ON "user_feature_flags"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_feature_flags_user_id_feature_key" ON "user_feature_flags"("user_id", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "global_feature_flags_feature_key" ON "global_feature_flags"("feature");

-- CreateIndex
CREATE INDEX "global_feature_flags_enabled_idx" ON "global_feature_flags"("enabled");

-- CreateIndex
CREATE INDEX "email_verification_codes_email_idx" ON "email_verification_codes"("email");

-- CreateIndex
CREATE INDEX "email_verification_codes_code_idx" ON "email_verification_codes"("code");

-- CreateIndex
CREATE INDEX "email_verification_codes_expires_at_idx" ON "email_verification_codes"("expires_at");

-- CreateIndex
CREATE INDEX "geo_airlines_geom_idx" ON "geo_airlines" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_coastlines_geom_idx" ON "geo_coastlines" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_country_geom_idx" ON "geo_country" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_dem_cities_merged_filename_idx" ON "geo_dem_cities_merged"("filename");

-- CreateIndex
CREATE INDEX "geo_mountains_standard_geom_idx" ON "geo_mountains_standard" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_mountains_standard_300_geom_idx" ON "geo_mountains_standard_300" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_ports_geom_idx" ON "geo_ports" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_railways_geom_idx" ON "geo_railways" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_rivers_line_geom_idx" ON "geo_rivers_line" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_roads_geom_idx" ON "geo_roads" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "geo_water_poly_geom_idx" ON "geo_water_poly" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "poi_canonical_category_idx" ON "poi_canonical"("category");

-- CreateIndex
CREATE INDEX "poi_canonical_geom_idx" ON "poi_canonical" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "poi_canonical_region_key_idx" ON "poi_canonical"("region_key");

-- CreateIndex
CREATE INDEX "poi_canonical_tags_slim_idx" ON "poi_canonical" USING GIN ("tags_slim");

-- CreateIndex
CREATE UNIQUE INDEX "poi_canonical_source_source_key_key" ON "poi_canonical"("source", "source_key");

-- CreateIndex
CREATE INDEX "poi_osm_raw_geom_idx" ON "poi_osm_raw" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "poi_osm_raw_region_key_idx" ON "poi_osm_raw"("region_key");

-- CreateIndex
CREATE INDEX "poi_osm_raw_tags_idx" ON "poi_osm_raw" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "poi_osm_raw_osm_type_osm_id_key" ON "poi_osm_raw"("osm_type", "osm_id");

-- CreateIndex
CREATE INDEX "decision_logs_trip_id_idx" ON "decision_logs"("trip_id");

-- CreateIndex
CREATE INDEX "decision_logs_country_code_idx" ON "decision_logs"("country_code");

-- CreateIndex
CREATE INDEX "decision_logs_route_direction_id_idx" ON "decision_logs"("route_direction_id");

-- CreateIndex
CREATE INDEX "decision_logs_decision_source_idx" ON "decision_logs"("decision_source");

-- CreateIndex
CREATE INDEX "decision_logs_decision_stage_idx" ON "decision_logs"("decision_stage");

-- CreateIndex
CREATE INDEX "decision_logs_persona_idx" ON "decision_logs"("persona");

-- CreateIndex
CREATE INDEX "decision_logs_timestamp_idx" ON "decision_logs"("timestamp");

-- CreateIndex
CREATE INDEX "decision_logs_country_code_route_direction_id_decision_sour_idx" ON "decision_logs"("country_code", "route_direction_id", "decision_source");

-- CreateIndex
CREATE INDEX "decision_logs_decision_stage_decision_source_idx" ON "decision_logs"("decision_stage", "decision_source");

-- CreateIndex
CREATE INDEX "decision_outcomes_decision_id_idx" ON "decision_outcomes"("decision_id");

-- CreateIndex
CREATE INDEX "user_travel_profile_userId_idx" ON "user_travel_profile"("userId");

-- CreateIndex
CREATE INDEX "route_direction_decision_user_id_idx" ON "route_direction_decision"("user_id");

-- CreateIndex
CREATE INDEX "route_direction_decision_user_id_country_code_idx" ON "route_direction_decision"("user_id", "country_code");

-- CreateIndex
CREATE INDEX "route_direction_decision_selected_route_direction_id_countr_idx" ON "route_direction_decision"("selected_route_direction_id", "country_code");

-- CreateIndex
CREATE INDEX "route_direction_health_route_direction_id_country_code_idx" ON "route_direction_health"("route_direction_id", "country_code");

-- CreateIndex
CREATE INDEX "trip_outcome_feedback_user_id_idx" ON "trip_outcome_feedback"("user_id");

-- CreateIndex
CREATE INDEX "trip_outcome_feedback_trip_id_idx" ON "trip_outcome_feedback"("trip_id");

-- CreateIndex
CREATE INDEX "flywheel_decision_logs_user_id_idx" ON "flywheel_decision_logs"("user_id");

-- CreateIndex
CREATE INDEX "flywheel_decision_logs_trip_id_idx" ON "flywheel_decision_logs"("trip_id");

-- CreateIndex
CREATE INDEX "flywheel_decision_logs_created_at_idx" ON "flywheel_decision_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "flywheel_behavior_logs_user_id_idx" ON "flywheel_behavior_logs"("user_id");

-- CreateIndex
CREATE INDEX "flywheel_behavior_logs_trip_id_idx" ON "flywheel_behavior_logs"("trip_id");

-- CreateIndex
CREATE INDEX "flywheel_behavior_logs_event_type_idx" ON "flywheel_behavior_logs"("event_type");

-- CreateIndex
CREATE INDEX "flywheel_behavior_logs_created_at_idx" ON "flywheel_behavior_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "flywheel_outcomes_user_id_idx" ON "flywheel_outcomes"("user_id");

-- CreateIndex
CREATE INDEX "flywheel_outcomes_created_at_idx" ON "flywheel_outcomes"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "flywheel_outcomes_trip_id_key" ON "flywheel_outcomes"("trip_id");

-- CreateIndex
CREATE INDEX "shadow_decisions_user_id_idx" ON "shadow_decisions"("user_id");

-- CreateIndex
CREATE INDEX "shadow_decisions_trip_id_idx" ON "shadow_decisions"("trip_id");

-- CreateIndex
CREATE INDEX "shadow_decisions_context_key_idx" ON "shadow_decisions"("context_key");

-- CreateIndex
CREATE INDEX "shadow_decisions_captured_at_idx" ON "shadow_decisions"("captured_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "flywheel_consensus_latches_context_key_key" ON "flywheel_consensus_latches"("context_key");

-- CreateIndex
CREATE INDEX "flywheel_consensus_latches_updated_at_idx" ON "flywheel_consensus_latches"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "flywheel_parameter_sets_scope_scope_id_idx" ON "flywheel_parameter_sets"("scope", "scope_id");

-- CreateIndex
CREATE INDEX "flywheel_parameter_sets_is_active_idx" ON "flywheel_parameter_sets"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "flywheel_parameter_sets_version_scope_scope_id_key" ON "flywheel_parameter_sets"("version", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "flywheel_user_parameter_bindings_parameter_set_id_idx" ON "flywheel_user_parameter_bindings"("parameter_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "flywheel_user_parameter_bindings_user_id_key" ON "flywheel_user_parameter_bindings"("user_id");

-- CreateIndex
CREATE INDEX "trip_runs_trip_id_idx" ON "trip_runs"("trip_id");

-- CreateIndex
CREATE INDEX "trip_runs_user_id_idx" ON "trip_runs"("user_id");

-- CreateIndex
CREATE INDEX "trip_runs_planning_phase_idx" ON "trip_runs"("planning_phase");

-- CreateIndex
CREATE INDEX "trip_runs_status_idx" ON "trip_runs"("status");

-- CreateIndex
CREATE INDEX "trip_runs_created_at_idx" ON "trip_runs"("created_at");

-- CreateIndex
CREATE INDEX "trip_attempts_trip_run_id_idx" ON "trip_attempts"("trip_run_id");

-- CreateIndex
CREATE INDEX "trip_attempts_status_idx" ON "trip_attempts"("status");

-- CreateIndex
CREATE INDEX "trip_attempts_attempt_number_idx" ON "trip_attempts"("attempt_number");

-- CreateIndex
CREATE INDEX "trip_attempts_created_at_idx" ON "trip_attempts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trip_attempts_trip_run_id_attempt_number_key" ON "trip_attempts"("trip_run_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_files_filename_key" ON "knowledge_files"("filename");

-- CreateIndex
CREATE INDEX "knowledge_files_category_idx" ON "knowledge_files"("category");

-- CreateIndex
CREATE INDEX "knowledge_files_category_sub_type_idx" ON "knowledge_files"("category", "sub_type");

-- CreateIndex
CREATE INDEX "knowledge_files_filename_idx" ON "knowledge_files"("filename");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_chunk_id_key" ON "chunks"("chunk_id");

-- CreateIndex
CREATE INDEX "chunks_type_idx" ON "chunks"("type");

-- CreateIndex
CREATE INDEX "chunks_credibility_score_idx" ON "chunks"("credibility_score");

-- CreateIndex
CREATE INDEX "chunks_file_id_idx" ON "chunks"("file_id");

-- CreateIndex
CREATE INDEX "chunks_category_idx" ON "chunks"("category");

-- CreateIndex
CREATE INDEX "chunks_last_verified_at_idx" ON "chunks"("last_verified_at");

-- CreateIndex
CREATE INDEX "chunks_category_last_verified_at_idx" ON "chunks"("category", "last_verified_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_indices_keyword_key" ON "keyword_indices"("keyword");

-- CreateIndex
CREATE INDEX "query_history_created_at_idx" ON "query_history"("created_at");

-- CreateIndex
CREATE INDEX "compliance_evidence_country_code_idx" ON "compliance_evidence"("country_code");

-- CreateIndex
CREATE INDEX "compliance_evidence_rule_type_idx" ON "compliance_evidence"("rule_type");

-- CreateIndex
CREATE INDEX "compliance_evidence_country_code_rule_type_idx" ON "compliance_evidence"("country_code", "rule_type");

-- CreateIndex
CREATE INDEX "local_insight_country_code_idx" ON "local_insight"("country_code");

-- CreateIndex
CREATE INDEX "local_insight_tags_idx" ON "local_insight"("tags");

-- CreateIndex
CREATE INDEX "local_insight_country_code_tags_idx" ON "local_insight"("country_code", "tags");

-- CreateIndex
CREATE INDEX "contact_messages_user_id_idx" ON "contact_messages"("user_id");

-- CreateIndex
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages"("created_at");

-- CreateIndex
CREATE INDEX "contact_messages_status_idx" ON "contact_messages"("status");

-- CreateIndex
CREATE INDEX "contact_message_images_contact_message_id_idx" ON "contact_message_images"("contact_message_id");

-- CreateIndex
CREATE INDEX "trip_checklist_status_trip_id_idx" ON "trip_checklist_status"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_checklist_status_trip_id_finding_id_key" ON "trip_checklist_status"("trip_id", "finding_id");

-- CreateIndex
CREATE INDEX "trip_finding_marks_trip_id_idx" ON "trip_finding_marks"("trip_id");

-- CreateIndex
CREATE INDEX "trip_finding_marks_finding_id_idx" ON "trip_finding_marks"("finding_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_finding_marks_trip_id_finding_id_mark_type_key" ON "trip_finding_marks"("trip_id", "finding_id", "mark_type");

-- CreateIndex
CREATE INDEX "trip_capability_pack_items_trip_id_idx" ON "trip_capability_pack_items"("trip_id");

-- CreateIndex
CREATE INDEX "trip_capability_pack_items_source_pack_type_idx" ON "trip_capability_pack_items"("source_pack_type");

-- CreateIndex
CREATE UNIQUE INDEX "trip_capability_pack_items_trip_id_rule_id_source_pack_type_key" ON "trip_capability_pack_items"("trip_id", "rule_id", "source_pack_type");

-- CreateIndex
CREATE INDEX "trip_packing_list_items_trip_id_idx" ON "trip_packing_list_items"("trip_id");

-- CreateIndex
CREATE INDEX "trip_packing_list_items_category_idx" ON "trip_packing_list_items"("category");

-- CreateIndex
CREATE INDEX "approval_requests_thread_id_idx" ON "approval_requests"("thread_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_thread_id_status_idx" ON "approval_requests"("thread_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_agent_run_id_idx" ON "approval_requests"("agent_run_id");

-- CreateIndex
CREATE INDEX "approval_requests_tool_call_id_idx" ON "approval_requests"("tool_call_id");

-- CreateIndex
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "hazard_zones_zone_id_key" ON "hazard_zones"("zone_id");

-- CreateIndex
CREATE INDEX "hazard_zones_country_code_idx" ON "hazard_zones"("country_code");

-- CreateIndex
CREATE INDEX "hazard_zones_type_idx" ON "hazard_zones"("type");

-- CreateIndex
CREATE INDEX "hazard_zones_level_idx" ON "hazard_zones"("level");

-- CreateIndex
CREATE INDEX "hazard_zones_country_code_type_idx" ON "hazard_zones"("country_code", "type");

-- CreateIndex
CREATE INDEX "hazard_zones_country_code_level_idx" ON "hazard_zones"("country_code", "level");

-- CreateIndex
CREATE INDEX "hazard_zones_geom_idx" ON "hazard_zones" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "data_consents_user_id_idx" ON "data_consents"("user_id");

-- CreateIndex
CREATE INDEX "data_consents_purpose_idx" ON "data_consents"("purpose");

-- CreateIndex
CREATE INDEX "data_consents_status_idx" ON "data_consents"("status");

-- CreateIndex
CREATE INDEX "data_consents_user_id_purpose_idx" ON "data_consents"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "data_consents_user_id_purpose_status_key" ON "data_consents"("user_id", "purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_data_type_key" ON "data_retention_policies"("data_type");

-- CreateIndex
CREATE UNIQUE INDEX "validated_trajectories_trajectory_id_key" ON "validated_trajectories"("trajectory_id");

-- CreateIndex
CREATE INDEX "validated_trajectories_validation_status_idx" ON "validated_trajectories"("validation_status");

-- CreateIndex
CREATE INDEX "validated_trajectories_validation_score_idx" ON "validated_trajectories"("validation_score");

-- CreateIndex
CREATE INDEX "validated_trajectories_used_for_training_idx" ON "validated_trajectories"("used_for_training");

-- CreateIndex
CREATE INDEX "validated_trajectories_country_code_validation_status_idx" ON "validated_trajectories"("country_code", "validation_status");

-- CreateIndex
CREATE INDEX "validated_trajectories_request_id_idx" ON "validated_trajectories"("request_id");

-- CreateIndex
CREATE INDEX "validated_trajectories_trip_id_idx" ON "validated_trajectories"("trip_id");

-- CreateIndex
CREATE INDEX "validated_trajectories_model_version_idx" ON "validated_trajectories"("model_version");

-- CreateIndex
CREATE INDEX "validated_trajectories_training_batch_id_idx" ON "validated_trajectories"("training_batch_id");

-- CreateIndex
CREATE INDEX "planning_plans_trip_id_idx" ON "planning_plans"("trip_id");

-- CreateIndex
CREATE INDEX "planning_plans_trip_id_status_idx" ON "planning_plans"("trip_id", "status");

-- CreateIndex
CREATE INDEX "planning_plans_status_idx" ON "planning_plans"("status");

-- CreateIndex
CREATE INDEX "planning_plans_created_at_idx" ON "planning_plans"("created_at");

-- CreateIndex
CREATE INDEX "idx_rag_decision_logs_request_id" ON "rag_decision_logs"("request_id");

-- CreateIndex
CREATE INDEX "idx_rag_decision_logs_step" ON "rag_decision_logs"("step");

-- CreateIndex
CREATE INDEX "idx_rag_decision_logs_actor" ON "rag_decision_logs"("actor");

-- CreateIndex
CREATE INDEX "idx_rag_decision_logs_timestamp" ON "rag_decision_logs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_rag_knowledge_gaps_category" ON "rag_knowledge_gaps"("category");

-- CreateIndex
CREATE INDEX "idx_rag_knowledge_gaps_timestamp" ON "rag_knowledge_gaps"("timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "decision_drafts_draft_id_key" ON "decision_drafts"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_drafts_workflow_id_key" ON "decision_drafts"("workflow_id");

-- CreateIndex
CREATE INDEX "decision_drafts_workflow_id_idx" ON "decision_drafts"("workflow_id");

-- CreateIndex
CREATE INDEX "decision_drafts_draft_id_idx" ON "decision_drafts"("draft_id");

-- CreateIndex
CREATE INDEX "decision_drafts_created_at_idx" ON "decision_drafts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "decision_steps_decision_draft_id_idx" ON "decision_steps"("decision_draft_id");

-- CreateIndex
CREATE INDEX "decision_steps_step_id_idx" ON "decision_steps"("step_id");

-- CreateIndex
CREATE INDEX "decision_steps_status_idx" ON "decision_steps"("status");

-- CreateIndex
CREATE INDEX "decision_steps_decision_type_idx" ON "decision_steps"("decision_type");

-- CreateIndex
CREATE UNIQUE INDEX "decision_steps_decision_draft_id_step_id_key" ON "decision_steps"("decision_draft_id", "step_id");

-- CreateIndex
CREATE UNIQUE INDEX "decision_draft_versions_version_id_key" ON "decision_draft_versions"("version_id");

-- CreateIndex
CREATE INDEX "decision_draft_versions_workflow_id_idx" ON "decision_draft_versions"("workflow_id");

-- CreateIndex
CREATE INDEX "decision_draft_versions_workflow_id_version_idx" ON "decision_draft_versions"("workflow_id", "version");

-- CreateIndex
CREATE INDEX "decision_draft_versions_created_at_idx" ON "decision_draft_versions"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "destination_clarification_configs_destination_code_key" ON "destination_clarification_configs"("destination_code");

-- CreateIndex
CREATE INDEX "destination_clarification_configs_destination_code_idx" ON "destination_clarification_configs"("destination_code");

-- CreateIndex
CREATE INDEX "destination_clarification_configs_enabled_idx" ON "destination_clarification_configs"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "model_versions_version_key" ON "model_versions"("version");

-- CreateIndex
CREATE INDEX "model_versions_model_type_is_active_idx" ON "model_versions"("model_type", "is_active");

-- CreateIndex
CREATE INDEX "model_versions_version_idx" ON "model_versions"("version");

-- CreateIndex
CREATE INDEX "data_quality_monitors_country_code_idx" ON "data_quality_monitors"("country_code");

-- CreateIndex
CREATE INDEX "data_quality_monitors_status_idx" ON "data_quality_monitors"("status");

-- CreateIndex
CREATE INDEX "data_quality_monitors_overall_score_idx" ON "data_quality_monitors"("overall_score");

-- CreateIndex
CREATE UNIQUE INDEX "data_quality_monitors_data_source_data_type_key" ON "data_quality_monitors"("data_source", "data_type");

-- CreateIndex
CREATE INDEX "data_quality_alerts_monitor_id_idx" ON "data_quality_alerts"("monitor_id");

-- CreateIndex
CREATE INDEX "data_quality_alerts_geographic_monitor_id_idx" ON "data_quality_alerts"("geographic_monitor_id");

-- CreateIndex
CREATE INDEX "data_quality_alerts_status_idx" ON "data_quality_alerts"("status");

-- CreateIndex
CREATE INDEX "data_quality_alerts_severity_idx" ON "data_quality_alerts"("severity");

-- CreateIndex
CREATE INDEX "data_quality_alerts_created_at_idx" ON "data_quality_alerts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "geographic_data_quality_monitors_country_code_idx" ON "geographic_data_quality_monitors"("country_code");

-- CreateIndex
CREATE INDEX "geographic_data_quality_monitors_data_type_idx" ON "geographic_data_quality_monitors"("data_type");

-- CreateIndex
CREATE INDEX "geographic_data_quality_monitors_status_idx" ON "geographic_data_quality_monitors"("status");

-- CreateIndex
CREATE INDEX "geographic_data_quality_monitors_overall_score_idx" ON "geographic_data_quality_monitors"("overall_score");

-- CreateIndex
CREATE INDEX "geographic_data_quality_monitors_coverage_rate_idx" ON "geographic_data_quality_monitors"("coverage_rate");

-- CreateIndex
CREATE UNIQUE INDEX "geographic_data_quality_monitors_data_source_data_type_key" ON "geographic_data_quality_monitors"("data_source", "data_type");

-- CreateIndex
CREATE INDEX "context_learning_results_user_id_idx" ON "context_learning_results"("user_id");

-- CreateIndex
CREATE INDEX "context_learning_results_trip_id_idx" ON "context_learning_results"("trip_id");

-- CreateIndex
CREATE INDEX "context_learning_results_block_key_idx" ON "context_learning_results"("block_key");

-- CreateIndex
CREATE INDEX "context_learning_results_block_type_idx" ON "context_learning_results"("block_type");

-- CreateIndex
CREATE INDEX "context_learning_results_event_type_idx" ON "context_learning_results"("event_type");

-- CreateIndex
CREATE INDEX "context_learning_results_phase_idx" ON "context_learning_results"("phase");

-- CreateIndex
CREATE INDEX "context_learning_results_agent_idx" ON "context_learning_results"("agent");

-- CreateIndex
CREATE INDEX "context_learning_results_importance_score_idx" ON "context_learning_results"("importance_score");

-- CreateIndex
CREATE INDEX "context_learning_results_confidence_idx" ON "context_learning_results"("confidence");

-- CreateIndex
CREATE INDEX "context_learning_results_created_at_idx" ON "context_learning_results"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_capabilities_service_name_key" ON "mcp_capabilities"("service_name");

-- CreateIndex
CREATE INDEX "idx_mcp_capabilities_category" ON "mcp_capabilities"("category");

-- CreateIndex
CREATE INDEX "idx_mcp_capabilities_enabled" ON "mcp_capabilities"("enabled");

-- CreateIndex
CREATE INDEX "idx_mcp_capabilities_service_name" ON "mcp_capabilities"("service_name");

-- CreateIndex
CREATE UNIQUE INDEX "adaptive_world_model_version_version_key" ON "adaptive_world_model_version"("version");

-- CreateIndex
CREATE INDEX "adaptive_world_model_version_trained_on_idx" ON "adaptive_world_model_version"("trained_on");

-- CreateIndex
CREATE INDEX "adaptive_world_model_version_version_idx" ON "adaptive_world_model_version"("version");

-- CreateIndex
CREATE INDEX "data_quality_score_contribution_id_idx" ON "data_quality_score"("contribution_id");

-- CreateIndex
CREATE INDEX "data_quality_score_overall_score_idx" ON "data_quality_score"("overall_score");

-- CreateIndex
CREATE INDEX "expert_verification_contribution_id_idx" ON "expert_verification"("contribution_id");

-- CreateIndex
CREATE INDEX "expert_verification_created_at_idx" ON "expert_verification"("created_at");

-- CreateIndex
CREATE INDEX "expert_verification_expert_id_idx" ON "expert_verification"("expert_id");

-- CreateIndex
CREATE INDEX "expert_verification_result_idx" ON "expert_verification"("verification_result");

-- CreateIndex
CREATE INDEX "failure_risk_prediction_date_idx" ON "failure_risk_prediction"("prediction_date");

-- CreateIndex
CREATE INDEX "failure_risk_prediction_route_direction_id_idx" ON "failure_risk_prediction"("route_direction_id");

-- CreateIndex
CREATE INDEX "failure_risk_prediction_trip_id_idx" ON "failure_risk_prediction"("trip_id");

-- CreateIndex
CREATE INDEX "idx_anomalies_severity" ON "fitness_anomalies"("severity");

-- CreateIndex
CREATE INDEX "idx_anomalies_type" ON "fitness_anomalies"("anomaly_type");

-- CreateIndex
CREATE INDEX "idx_anomalies_user" ON "fitness_anomalies"("user_id");

-- CreateIndex
CREATE INDEX "idx_fitness_calibration_history_calibrated_at" ON "fitness_calibration_history"("calibrated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_fitness_calibration_history_source" ON "fitness_calibration_history"("calibration_source");

-- CreateIndex
CREATE INDEX "idx_fitness_calibration_history_user_id" ON "fitness_calibration_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_experiment_events_created" ON "fitness_experiment_events"("created_at");

-- CreateIndex
CREATE INDEX "idx_experiment_events_experiment" ON "fitness_experiment_events"("experiment_id");

-- CreateIndex
CREATE INDEX "idx_experiment_events_type" ON "fitness_experiment_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_experiment_events_user" ON "fitness_experiment_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_experiment_events_variant" ON "fitness_experiment_events"("experiment_id", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_questionnaire_answers_user_id_key" ON "fitness_questionnaire_answers"("user_id");

-- CreateIndex
CREATE INDEX "idx_fitness_questionnaire_age_group" ON "fitness_questionnaire_answers"("age_group");

-- CreateIndex
CREATE INDEX "idx_fitness_questionnaire_created_at" ON "fitness_questionnaire_answers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_fitness_questionnaire_fitness_level" ON "fitness_questionnaire_answers"("fitness_level");

-- CreateIndex
CREATE INDEX "idx_fitness_questionnaire_user_id" ON "fitness_questionnaire_answers"("user_id");

-- CreateIndex
CREATE INDEX "idx_reports_generated" ON "fitness_reports"("generated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_user" ON "fitness_reports"("user_id");

-- CreateIndex
CREATE INDEX "idx_reports_user_period" ON "fitness_reports"("user_id", "period_end" DESC);

-- CreateIndex
CREATE INDEX "idx_trend_cache_expires" ON "fitness_trend_cache"("expires_at");

-- CreateIndex
CREATE INDEX "idx_trend_cache_user" ON "fitness_trend_cache"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_trend_cache_user_id_period_days_key" ON "fitness_trend_cache"("user_id", "period_days");

-- CreateIndex
CREATE UNIQUE INDEX "realtime_poi_status_poi_id_unique_idx" ON "realtime_poi_status"("poi_id");

-- CreateIndex
CREATE INDEX "realtime_poi_status_last_update_idx" ON "realtime_poi_status"("last_update");

-- CreateIndex
CREATE INDEX "realtime_poi_status_poi_id_idx" ON "realtime_poi_status"("poi_id");

-- CreateIndex
CREATE UNIQUE INDEX "realtime_road_status_road_id_unique_idx" ON "realtime_road_status"("road_id");

-- CreateIndex
CREATE INDEX "realtime_road_status_last_update_idx" ON "realtime_road_status"("last_update");

-- CreateIndex
CREATE INDEX "realtime_road_status_road_id_idx" ON "realtime_road_status"("road_id");

-- CreateIndex
CREATE INDEX "realtime_road_status_source_idx" ON "realtime_road_status"("source");

-- CreateIndex
CREATE INDEX "realtime_weather_alerts_region_idx" ON "realtime_weather_alerts"("region");

-- CreateIndex
CREATE INDEX "realtime_weather_alerts_severity_idx" ON "realtime_weather_alerts"("severity");

-- CreateIndex
CREATE INDEX "realtime_weather_alerts_time_idx" ON "realtime_weather_alerts"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "road_status_prediction_date_idx" ON "road_status_prediction"("prediction_date");

-- CreateIndex
CREATE INDEX "road_status_prediction_road_date_idx" ON "road_status_prediction"("road_id", "prediction_date");

-- CreateIndex
CREATE INDEX "road_status_prediction_road_id_idx" ON "road_status_prediction"("road_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_difficulty_correction_route_direction_id_key" ON "route_difficulty_correction"("route_direction_id");

-- CreateIndex
CREATE INDEX "route_difficulty_correction_route_direction_id_idx" ON "route_difficulty_correction"("route_direction_id");

-- CreateIndex
CREATE INDEX "route_difficulty_correction_user_count_idx" ON "route_difficulty_correction"("user_count");

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_actual_effort_rating" ON "trip_fitness_feedback"("actual_effort_rating");

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_completed" ON "trip_fitness_feedback"("completed_as_planned");

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_feedback_at" ON "trip_fitness_feedback"("feedback_at" DESC);

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_processed" ON "trip_fitness_feedback"("processed");

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_trip_id" ON "trip_fitness_feedback"("trip_id");

-- CreateIndex
CREATE INDEX "idx_trip_fitness_feedback_user_id" ON "trip_fitness_feedback"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_fitness_feedback_trip_user_key" ON "trip_fitness_feedback"("trip_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_capability_learning_user_id_key" ON "user_capability_learning"("user_id");

-- CreateIndex
CREATE INDEX "user_capability_learning_last_updated_idx" ON "user_capability_learning"("last_updated");

-- CreateIndex
CREATE INDEX "user_capability_learning_user_id_idx" ON "user_capability_learning"("user_id");

-- CreateIndex
CREATE INDEX "user_contribution_created_at_idx" ON "user_contribution"("created_at");

-- CreateIndex
CREATE INDEX "user_contribution_quality_score_idx" ON "user_contribution"("quality_score");

-- CreateIndex
CREATE INDEX "user_contribution_status_idx" ON "user_contribution"("status");

-- CreateIndex
CREATE INDEX "user_contribution_target_id_idx" ON "user_contribution"("target_id");

-- CreateIndex
CREATE INDEX "user_contribution_type_idx" ON "user_contribution"("type");

-- CreateIndex
CREATE INDEX "user_contribution_user_id_idx" ON "user_contribution"("user_id");

-- CreateIndex
CREATE INDEX "user_feedback_created_at_idx" ON "user_feedback"("created_at");

-- CreateIndex
CREATE INDEX "user_feedback_feedback_type_idx" ON "user_feedback"("feedback_type");

-- CreateIndex
CREATE INDEX "user_feedback_quality_score_idx" ON "user_feedback"("quality_score");

-- CreateIndex
CREATE INDEX "user_feedback_trip_id_idx" ON "user_feedback"("trip_id");

-- CreateIndex
CREATE INDEX "user_feedback_user_id_idx" ON "user_feedback"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_fitness_profile_snapshot_confidence" ON "user_fitness_profile_snapshot"("confidence_level");

-- CreateIndex
CREATE INDEX "idx_user_fitness_profile_snapshot_fitness_level" ON "user_fitness_profile_snapshot"("fitness_level");

-- CreateIndex
CREATE INDEX "idx_user_fitness_profile_snapshot_snapshot_at" ON "user_fitness_profile_snapshot"("snapshot_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_fitness_profile_snapshot_user_id" ON "user_fitness_profile_snapshot"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_activities_activity_id_key" ON "wearable_activities"("activity_id");

-- CreateIndex
CREATE INDEX "idx_wearable_act_provider" ON "wearable_activities"("provider");

-- CreateIndex
CREATE INDEX "idx_wearable_act_start" ON "wearable_activities"("start_date");

-- CreateIndex
CREATE INDEX "idx_wearable_act_type" ON "wearable_activities"("activity_type");

-- CreateIndex
CREATE INDEX "idx_wearable_act_user" ON "wearable_activities"("user_id");

-- CreateIndex
CREATE INDEX "idx_wearable_act_user_date" ON "wearable_activities"("user_id", "start_date" DESC);

-- CreateIndex
CREATE INDEX "idx_wearable_conn_provider" ON "wearable_connections"("provider");

-- CreateIndex
CREATE INDEX "idx_wearable_conn_user" ON "wearable_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wearable_connections_user_id_provider_key" ON "wearable_connections"("user_id", "provider");

-- CreateIndex
CREATE INDEX "idx_wearable_est_date" ON "wearable_fitness_estimates"("estimated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_wearable_est_user" ON "wearable_fitness_estimates"("user_id");

-- CreateIndex
CREATE INDEX "weather_prediction_date_idx" ON "weather_prediction"("prediction_date");

-- CreateIndex
CREATE INDEX "weather_prediction_region_date_idx" ON "weather_prediction"("region", "prediction_date");

-- CreateIndex
CREATE INDEX "weather_prediction_region_idx" ON "weather_prediction"("region");

-- CreateIndex
CREATE UNIQUE INDEX "world_model_versions_version_id_key" ON "world_model_versions"("version_id");

-- CreateIndex
CREATE INDEX "world_model_versions_created_at_idx" ON "world_model_versions"("created_at");

-- CreateIndex
CREATE INDEX "world_model_versions_is_active_idx" ON "world_model_versions"("is_active");

-- CreateIndex
CREATE INDEX "world_model_versions_metadata_idx" ON "world_model_versions" USING GIN ("metadata");

-- CreateIndex
CREATE INDEX "world_model_versions_version_id_idx" ON "world_model_versions"("version_id");

-- CreateIndex
CREATE INDEX "world_model_versions_version_idx" ON "world_model_versions"("version");

-- CreateIndex
CREATE INDEX "road_status_realtime_road_id_idx" ON "road_status_realtime"("road_id");

-- CreateIndex
CREATE INDEX "road_status_realtime_current_status_idx" ON "road_status_realtime"("current_status");

-- CreateIndex
CREATE INDEX "road_status_realtime_last_verified_at_idx" ON "road_status_realtime"("last_verified_at" DESC);

-- CreateIndex
CREATE INDEX "idx_road_status_road_verified" ON "road_status_realtime"("road_id", "last_verified_at" DESC);

-- CreateIndex
CREATE INDEX "road_status_realtime_data_source_idx" ON "road_status_realtime"("data_source");

-- CreateIndex
CREATE INDEX "weather_forecast_realtime_region_key_idx" ON "weather_forecast_realtime"("region_key");

-- CreateIndex
CREATE INDEX "weather_forecast_realtime_forecast_time_idx" ON "weather_forecast_realtime"("forecast_time");

-- CreateIndex
CREATE INDEX "idx_weather_valid_range" ON "weather_forecast_realtime"("valid_from", "valid_until");

-- CreateIndex
CREATE INDEX "weather_forecast_realtime_region_key_forecast_time_idx" ON "weather_forecast_realtime"("region_key", "forecast_time");

-- CreateIndex
CREATE INDEX "weather_forecast_realtime_location_idx" ON "weather_forecast_realtime" USING GIST ("location");

-- CreateIndex
CREATE INDEX "weather_forecast_realtime_data_source_idx" ON "weather_forecast_realtime"("data_source");

-- CreateIndex
CREATE UNIQUE INDEX "user_decision_weights_user_id_key" ON "user_decision_weights"("user_id");

-- CreateIndex
CREATE INDEX "user_decision_weights_user_id_idx" ON "user_decision_weights"("user_id");

-- CreateIndex
CREATE INDEX "weight_learning_history_user_id_idx" ON "weight_learning_history"("user_id");

-- CreateIndex
CREATE INDEX "weight_learning_history_created_at_idx" ON "weight_learning_history"("created_at");

-- CreateIndex
CREATE INDEX "weight_learning_history_user_id_created_at_idx" ON "weight_learning_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "dso_snapshots_request_id_idx" ON "dso_snapshots"("request_id");

-- CreateIndex
CREATE INDEX "dso_snapshots_created_at_idx" ON "dso_snapshots"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dso_snapshots_request_id_version_key" ON "dso_snapshots"("request_id", "version");

-- CreateIndex
CREATE INDEX "rlhf_feedback_records_user_id_idx" ON "rlhf_feedback_records"("user_id");

-- CreateIndex
CREATE INDEX "rlhf_feedback_records_trip_id_idx" ON "rlhf_feedback_records"("trip_id");

-- CreateIndex
CREATE INDEX "rlhf_feedback_records_feedback_type_idx" ON "rlhf_feedback_records"("feedback_type");

-- CreateIndex
CREATE INDEX "rlhf_feedback_records_created_at_idx" ON "rlhf_feedback_records"("created_at");

-- CreateIndex
CREATE INDEX "learning_convergence_logs_user_id_idx" ON "learning_convergence_logs"("user_id");

-- CreateIndex
CREATE INDEX "learning_convergence_logs_round_idx" ON "learning_convergence_logs"("round");

-- CreateIndex
CREATE INDEX "learning_convergence_logs_created_at_idx" ON "learning_convergence_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cbr_case_aggregates_signature_hash_key" ON "cbr_case_aggregates"("signature_hash");

-- CreateIndex
CREATE INDEX "cbr_case_aggregates_conflict_type_primary_violation_type_idx" ON "cbr_case_aggregates"("conflict_type", "primary_violation_type");

-- CreateIndex
CREATE INDEX "cbr_case_aggregates_updated_at_idx" ON "cbr_case_aggregates"("updated_at");

-- CreateIndex
CREATE INDEX "decision_intelligence_logs_dominant_cid_created_at_idx" ON "decision_intelligence_logs"("dominant_cid", "created_at");

-- CreateIndex
CREATE INDEX "decision_intelligence_logs_request_id_idx" ON "decision_intelligence_logs"("request_id");

-- CreateIndex
CREATE INDEX "decision_intelligence_logs_created_at_idx" ON "decision_intelligence_logs"("created_at");

-- CreateIndex
CREATE INDEX "decision_rule_configs_is_active_updated_at_idx" ON "decision_rule_configs"("is_active", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "decision_rule_configs_action_name_handler_id_key" ON "decision_rule_configs"("action_name", "handler_id");

-- CreateIndex
CREATE INDEX "agent_financial_holds_trip_id_expires_at_idx" ON "agent_financial_holds"("trip_id", "expires_at");

-- CreateIndex
CREATE INDEX "agent_action_logs_trip_id_action_id_created_at_idx" ON "agent_action_logs"("trip_id", "action_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_action_logs_status_updated_at_idx" ON "agent_action_logs"("status", "updated_at");

-- CreateIndex
CREATE INDEX "admin_activity_logs_created_at_idx" ON "admin_activity_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_saga_side_effect_replays_agent_action_log_id_key" ON "admin_saga_side_effect_replays"("agent_action_log_id");

-- CreateIndex
CREATE INDEX "admin_saga_side_effect_replays_idempotency_key_idx" ON "admin_saga_side_effect_replays"("idempotency_key");

-- CreateIndex
CREATE INDEX "admin_quality_marks_target_type_target_id_idx" ON "admin_quality_marks"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "admin_quality_marks_label_idx" ON "admin_quality_marks"("label");

-- CreateIndex
CREATE INDEX "admin_quality_marks_created_at_idx" ON "admin_quality_marks"("created_at");

-- CreateIndex
CREATE INDEX "physical_domain_inventory_items_type_availability_idx" ON "physical_domain_inventory_items"("type", "availability");

-- CreateIndex
CREATE INDEX "physical_domain_constraint_configs_enabled_updated_at_idx" ON "physical_domain_constraint_configs"("enabled", "updated_at");

-- CreateIndex
CREATE INDEX "physical_domain_data_source_configs_enabled_updated_at_idx" ON "physical_domain_data_source_configs"("enabled", "updated_at");

-- CreateIndex
CREATE INDEX "spatial_domain_pois_closed_updated_at_idx" ON "spatial_domain_pois"("closed", "updated_at");

-- CreateIndex
CREATE INDEX "spatial_domain_segments_from_poi_id_to_poi_id_idx" ON "spatial_domain_segments"("from_poi_id", "to_poi_id");

-- CreateIndex
CREATE INDEX "spatial_domain_segments_segment_type_updated_at_idx" ON "spatial_domain_segments"("segment_type", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runtime_replay_anchors_snapshot_id_key" ON "agent_runtime_replay_anchors"("snapshot_id");

-- CreateIndex
CREATE INDEX "agent_runtime_replay_anchors_query_id_created_at_idx" ON "agent_runtime_replay_anchors"("query_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runtime_replay_anchors_dedup_request_hash_idx" ON "agent_runtime_replay_anchors"("dedup_request_hash");

-- CreateIndex
CREATE INDEX "world_bus_event_logs_kind_recorded_at_idx" ON "world_bus_event_logs"("kind", "recorded_at");

-- CreateIndex
CREATE INDEX "world_bus_event_logs_cityKey_recorded_at_idx" ON "world_bus_event_logs"("cityKey", "recorded_at");

-- CreateIndex
CREATE INDEX "world_bus_event_logs_event_at_idx" ON "world_bus_event_logs"("event_at");

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_tripDayId_fkey" FOREIGN KEY ("tripDayId") REFERENCES "TripDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceEdge" ADD CONSTRAINT "PlaceEdge_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceEdge" ADD CONSTRAINT "PlaceEdge_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrowdCurve" ADD CONSTRAINT "CrowdCurve_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RailPassProfile" ADD CONSTRAINT "RailPassProfile_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RailSegment" ADD CONSTRAINT "RailSegment_itineraryItemId_fkey" FOREIGN KEY ("itineraryItemId") REFERENCES "ItineraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RailSegment" ADD CONSTRAINT "RailSegment_railPassProfileId_fkey" FOREIGN KEY ("railPassProfileId") REFERENCES "RailPassProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_readiness_decision" ADD CONSTRAINT "trip_readiness_decision_readinessPackId_fkey" FOREIGN KEY ("readinessPackId") REFERENCES "ReadinessPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTask" ADD CONSTRAINT "ReservationTask_railPassProfileId_fkey" FOREIGN KEY ("railPassProfileId") REFERENCES "RailPassProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationTask" ADD CONSTRAINT "ReservationTask_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "RailSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteTemplate" ADD CONSTRAINT "RouteTemplate_routeDirectionId_fkey" FOREIGN KEY ("routeDirectionId") REFERENCES "RouteDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trail" ADD CONSTRAINT "Trail_endPlaceId_fkey" FOREIGN KEY ("endPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trail" ADD CONSTRAINT "Trail_startPlaceId_fkey" FOREIGN KEY ("startPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailWaypoint" ADD CONSTRAINT "TrailWaypoint_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailWaypoint" ADD CONSTRAINT "TrailWaypoint_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_suggestion_states" ADD CONSTRAINT "trip_suggestion_states_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_revisions" ADD CONSTRAINT "itinerary_revisions_parent_revision_id_fkey" FOREIGN KEY ("parent_revision_id") REFERENCES "itinerary_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCollaborator" ADD CONSTRAINT "TripCollaborator_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripCollection" ADD CONSTRAINT "TripCollection_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripDay" ADD CONSTRAINT "TripDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLike" ADD CONSTRAINT "TripLike_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripShare" ADD CONSTRAINT "TripShare_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationTeamInvite" ADD CONSTRAINT "CollaborationTeamInvite_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CollaborationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationTeamMember" ADD CONSTRAINT "CollaborationTeamMember_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "CollaborationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_preferences" ADD CONSTRAINT "restaurant_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_bookings" ADD CONSTRAINT "restaurant_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_settings" ADD CONSTRAINT "currency_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_preferences" ADD CONSTRAINT "hotel_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_settings" ADD CONSTRAINT "translation_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_preferences" ADD CONSTRAINT "image_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feature_flags" ADD CONSTRAINT "user_feature_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_outcomes" ADD CONSTRAINT "decision_outcomes_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decision_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_attempts" ADD CONSTRAINT "trip_attempts_trip_run_id_fkey" FOREIGN KEY ("trip_run_id") REFERENCES "trip_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "knowledge_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_message_images" ADD CONSTRAINT "contact_message_images_contact_message_id_fkey" FOREIGN KEY ("contact_message_id") REFERENCES "contact_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_checklist_status" ADD CONSTRAINT "trip_checklist_status_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_finding_marks" ADD CONSTRAINT "trip_finding_marks_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_capability_pack_items" ADD CONSTRAINT "trip_capability_pack_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_packing_list_items" ADD CONSTRAINT "trip_packing_list_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_plans" ADD CONSTRAINT "planning_plans_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_steps" ADD CONSTRAINT "decision_steps_decision_draft_id_fkey" FOREIGN KEY ("decision_draft_id") REFERENCES "decision_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_alerts" ADD CONSTRAINT "data_quality_alerts_geographic_monitor_id_fkey" FOREIGN KEY ("geographic_monitor_id") REFERENCES "geographic_data_quality_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_alerts" ADD CONSTRAINT "data_quality_alerts_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "data_quality_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_score" ADD CONSTRAINT "data_quality_score_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "user_contribution"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "expert_verification" ADD CONSTRAINT "expert_verification_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "user_contribution"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

