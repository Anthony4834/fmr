# Deploying to Vercel

This guide walks you through deploying your FMR Search app to Vercel.

## Prerequisites

- ✅ GitHub repository is set up (already done: https://github.com/Anthony4834/fmr)
- ✅ Bun installed locally
- ✅ Project code is committed and pushed to GitHub

## Step 1: Create Vercel Account & Project

### Option A: Via Vercel Dashboard (Recommended)

1. **Go to Vercel**:
   - Visit: https://vercel.com
   - Sign up or log in (you can use GitHub to sign in)

2. **Import Your Project**:
   - Click **"Add New..."** → **"Project"**
   - Click **"Import Git Repository"**
   - Find and select **"Anthony4834/fmr"**
   - Click **"Import"**

3. **Configure Project**:
   - **Framework Preset**: Should auto-detect "Next.js"
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `bun run build` (or leave default)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `bun install` (or leave default)
   - Click **"Deploy"** (we'll add environment variables next)

### Option B: Via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   bun add -g vercel
   # Or: npm i -g vercel
   ```

2. **Login**:
   ```bash
   vercel login
   ```

3. **Link Project**:
   ```bash
   cd /Users/sadleisi000/Documents/fmr
   vercel
   ```
   - Follow the prompts
   - Link to existing project or create new one

## Step 2: Set Up Vercel Postgres Database

1. **In Vercel Dashboard**:
   - Go to your project
   - Click **"Storage"** tab
   - Click **"Create Database"**
   - Select **"Postgres"**

2. **Configure Database**:
   - **Name**: `fmr-db` (or your preferred name)
   - **Region**: Choose closest to you
   - Click **"Create"**

3. **Get Connection String**:
   - Click on your database
   - Go to **".env.local"** tab
   - Copy the `POSTGRES_URL` value
   - It looks like: `postgres://default:password@host.region.postgres.vercel-storage.com:5432/verceldb`

## Step 3: Add Environment Variables

### In Vercel Dashboard:

1. **Go to Project Settings**:
   - Click your project → **"Settings"** → **"Environment Variables"**

2. **Add POSTGRES_URL**:
   - **Name**: `POSTGRES_URL`
   - **Value**: Paste the connection string from Step 2
   - **Environment**: Select all (Production, Preview, Development)
   - Click **"Save"**

3. **Optional - Add Geocoding Config**:
   - **Name**: `GEOCODING_SERVICE`
   - **Value**: `census` (or `google`)
   - **Environment**: All
   
   - **Name**: `GEOCODING_API_KEY` (if using Google)
   - **Value**: Your Google Maps API key
   - **Environment**: All

### Via CLI:

```bash
vercel env add POSTGRES_URL
# Paste your connection string when prompted
# Select environments: production, preview, development

# Optional:
vercel env add GEOCODING_SERVICE
vercel env add GEOCODING_API_KEY
```

## Step 4: Deploy

### If Using Dashboard:

1. **Redeploy**:
   - Go to **"Deployments"** tab
   - Click the **"..."** menu on latest deployment
   - Click **"Redeploy"**
   - Or push a new commit to trigger auto-deploy

### If Using CLI:

```bash
vercel --prod
```

## Step 5: Run Database Migrations

After deployment, you need to run the schema creation:

### Option 1: Via Vercel CLI (Recommended)

```bash
# Link to your project if not already linked
vercel link

# Run schema creation script
vercel env pull .env.local
bun scripts/ingest-zip-county.ts -- --url <data-url>
```

### Option 2: Via Vercel Functions

Create an API route to initialize the schema (one-time):

```typescript
// app/api/init-schema/route.ts
import { createSchema } from '@/lib/schema';

export async function POST() {
  try {
    await createSchema();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
```

Then call it once: `https://your-app.vercel.app/api/init-schema`

## Step 6: Verify Deployment

1. **Check Deployment**:
   - Go to **"Deployments"** tab in Vercel
   - Your app should be live at: `https://fmr-xxx.vercel.app`

2. **Test the App**:
   - Visit your deployment URL
   - Check for any errors in the browser console
   - Check Vercel function logs for any issues

## Step 7: Set Up Custom Domain (Optional)

1. **In Vercel Dashboard**:
   - Go to **"Settings"** → **"Domains"**
   - Add your custom domain
   - Follow DNS configuration instructions

## Troubleshooting

### Build Fails

- Check **"Deployments"** → **"Build Logs"**
- Ensure `bun install` works locally
- Check that all dependencies are in `package.json`

### Database Connection Errors

- Verify `POSTGRES_URL` is set correctly
- Check that database is active in Vercel Storage
- Ensure environment variables are set for the right environments

### Runtime Errors

- Check **"Functions"** tab for serverless function logs
- Check browser console for client-side errors
- Verify API routes are working

## Next Steps After Deployment

1. **Run Data Ingestion**:
   ```bash
   # Pull environment variables
   vercel env pull .env.local
   
   # Run ingestion scripts locally (they'll use Vercel Postgres)
   bun run ingest:zip-county -- --url <data-url>
   bun run ingest:fmr -- --year 2024
   bun run ingest:safmr -- --year 2024
   ```

2. **Set Up Automatic Deployments**:
   - Vercel automatically deploys on push to `main`
   - Configure branch protection if needed

3. **Monitor**:
   - Use Vercel Analytics (if enabled)
   - Check function logs regularly
   - Monitor database usage

## Useful Vercel Commands

```bash
# View deployments
vercel ls

# View logs
vercel logs

# Open project in browser
vercel open

# Pull environment variables locally
vercel env pull .env.local
```

## Project Structure for Vercel

Your project should have:
- ✅ `package.json` with build scripts
- ✅ `vercel.json` (optional, for custom config)
- ✅ `.gitignore` (excludes `.env`, `node_modules`, etc.)
- ✅ Next.js app structure in `app/` directory

## Important Notes

- **Environment Variables**: Must be set in Vercel dashboard for production
- **Database**: Vercel Postgres is serverless and scales automatically
- **Builds**: Vercel uses Bun if detected, or falls back to npm/yarn
- **Functions**: API routes in `app/api/` become serverless functions

Your app should now be live on Vercel! 🚀

