-- CountryProfile: destination cover image for trip list fallback
ALTER TABLE "CountryProfile" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
