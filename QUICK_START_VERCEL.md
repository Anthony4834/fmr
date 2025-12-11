# Quick Start: Deploy to Vercel

## Step-by-Step Guide

### 1. Push Your Code to GitHub

```bash
git add .
git commit -m "Add Next.js app structure and Vercel config"
git push origin main
```

### 2. Go to Vercel Dashboard

1. Visit: https://vercel.com
2. Sign up/Login (use GitHub for easy integration)
3. Click **"Add New..."** → **"Project"**

### 3. Import Your Repository

1. Click **"Import Git Repository"**
2. Find **"Anthony4834/fmr"** in the list
3. Click **"Import"**

### 4. Configure Project Settings

Vercel should auto-detect Next.js, but verify:
- **Framework Preset**: Next.js ✅
- **Root Directory**: `./` ✅
- **Build Command**: `bun run build` (or leave default)
- **Output Directory**: `.next` ✅
- **Install Command**: `bun install` (or leave default)

**Don't click Deploy yet!** We need to set up the database first.

### 5. Create Vercel Postgres Database

1. In the same project, go to **"Storage"** tab
2. Click **"Create Database"**
3. Select **"Postgres"**
4. Name it: `fmr-db`
5. Choose region (closest to you)
6. Click **"Create"**

### 6. Get Database Connection String

1. Click on your new database (`fmr-db`)
2. Go to **".env.local"** tab
3. Copy the `POSTGRES_URL` value
   - Looks like: `postgres://default:xxx@xxx.postgres.vercel-storage.com:5432/verceldb`

### 7. Add Environment Variables

1. Go back to **"Settings"** → **"Environment Variables"**
2. Click **"Add New"**
3. Add:
   - **Name**: `POSTGRES_URL`
   - **Value**: Paste the connection string from step 6
   - **Environment**: Select all (Production, Preview, Development) ✅
4. Click **"Save"**

### 8. Deploy!

1. Go to **"Deployments"** tab
2. Click **"Deploy"** (or it may auto-deploy)
3. Wait for build to complete (~2-3 minutes)

### 9. Your App is Live! 🎉

Your app will be available at:
- `https://fmr-xxx.vercel.app` (auto-generated URL)
- Or your custom domain if you set one up

### 10. Initialize Database Schema

After deployment, run the schema creation:

**Option A: Via Local Script (Recommended)**
```bash
# Pull environment variables from Vercel
vercel env pull .env.local

# Run schema creation (it will use Vercel Postgres)
bun run ingest:zip-county -- --url <data-url>
```

**Option B: Via Vercel CLI**
```bash
# Install Vercel CLI if needed
bun add -g vercel

# Login
vercel login

# Link to project
vercel link

# Pull env vars
vercel env pull .env.local

# Run ingestion scripts
bun run ingest:zip-county -- --url <data-url>
bun run ingest:fmr -- --year 2024
bun run ingest:safmr -- --year 2024
```

## Verify Deployment

1. **Check Build Logs**:
   - Go to **"Deployments"** → Click on deployment → **"Build Logs"**
   - Should see successful build

2. **Visit Your App**:
   - Click the deployment URL
   - Should see "FMR Search" homepage

3. **Check Function Logs**:
   - Go to **"Functions"** tab
   - Should see any API routes listed

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Try running `bun run build` locally first

### Database Connection Errors
- Verify `POSTGRES_URL` is set in environment variables
- Check that database is active in Storage tab
- Ensure env var is set for all environments

### App Doesn't Load
- Check function logs for errors
- Verify Next.js app structure is correct
- Check browser console for client-side errors

## Next Steps

1. ✅ Deploy to Vercel
2. ✅ Set up Vercel Postgres
3. ✅ Add environment variables
4. ⏭️ Run data ingestion scripts
5. ⏭️ Build search UI components
6. ⏭️ Add API routes for search

## Useful Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Your Project**: https://vercel.com/dashboard (after import)
- **Documentation**: https://vercel.com/docs

Your app is now ready to deploy! 🚀


