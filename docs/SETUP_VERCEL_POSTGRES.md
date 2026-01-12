# Setting Up Vercel Postgres

This guide will walk you through creating a Vercel Postgres database and getting your connection string.

## Prerequisites

- A Vercel account (sign up at https://vercel.com if needed)
- A Vercel project (or we'll create one)

## Step-by-Step Setup

### Option 1: Via Vercel Dashboard (Recommended)

1. **Log in to Vercel**
   - Go to https://vercel.com/dashboard
   - Sign in or create an account

2. **Create or Select a Project**
   - If you don't have a project yet, you can create one later
   - For now, we just need the database

3. **Navigate to Storage**
   - Click on your project (or create a new one)
   - Go to the **Storage** tab
   - Or go directly to: https://vercel.com/dashboard/stores

4. **Create Postgres Database**
   - Click **"Create Database"** or **"Add"**
   - Select **"Postgres"**
   - Choose a name for your database (e.g., `fmr-db`)
   - Select a region (choose closest to you)
   - Click **"Create"**

5. **Get Connection String**
   - Once created, click on your database
   - Go to the **".env.local"** tab or **"Connection String"** section
   - Copy the `POSTGRES_URL` connection string
   - It will look like:
     ```
     postgres://default:password@host.region.postgres.vercel-storage.com:5432/verceldb
     ```

6. **Create .env file**
   - In your project root, create a `.env` file:
     ```bash
     POSTGRES_URL=your_connection_string_here
     ```
   - Replace `your_connection_string_here` with the actual connection string from Vercel

### Option 2: Via Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   bun add -g vercel
   # Or
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link your project** (if not already linked):
   ```bash
   vercel link
   ```

4. **Create Postgres database**:
   ```bash
   vercel storage create postgres --name fmr-db
   ```

5. **Get connection string**:
   ```bash
   vercel env pull .env.local
   ```
   This will create a `.env.local` file with your `POSTGRES_URL`

6. **Copy to .env**:
   ```bash
   cp .env.local .env
   # Or manually copy the POSTGRES_URL value
   ```

## Verify Setup

After setting up, verify your connection:

```bash
# Check that .env file exists and has POSTGRES_URL
cat .env | grep POSTGRES_URL
```

## Security Notes

- **Never commit `.env` to git** - it's already in `.gitignore`
- The `.env` file contains sensitive credentials
- Keep your connection string secure
- Consider using Vercel's environment variables in production

## Next Steps

Once you have your `POSTGRES_URL` in `.env`, you can:

1. **Test the connection** by running:
   ```bash
   bun scripts/ingest-zip-county.ts -- --url <data-url>
   ```

2. **Create the database schema** (happens automatically when you run any ingest script)

3. **Start ingesting data**:
   ```bash
   bun run ingest:zip-county -- --url <census-data-url>
   bun run ingest:fmr -- --year 2024
   bun run ingest:safmr -- --year 2024
   ```

## Troubleshooting

### Connection Errors

If you see connection errors:
- Verify your `POSTGRES_URL` is correct
- Check that the database is active in Vercel dashboard
- Ensure you're using the full connection string (not just the host)

### Database Not Found

- Make sure you've created the database in Vercel
- Check that you're using the correct project
- Verify the connection string format

### Permission Errors

- Ensure your Vercel account has access to the database
- Check that the database isn't paused or deleted

## Vercel Postgres Pricing

- **Hobby Plan**: Free tier available with limitations
- **Pro Plan**: Paid plans for production use
- Check current pricing at: https://vercel.com/pricing

## Alternative: Local Development

For local development, you can also use:
- **Docker Postgres**: Run Postgres locally
- **Supabase**: Free Postgres hosting
- **Neon**: Serverless Postgres

If using an alternative, just update your `POSTGRES_URL` in `.env` accordingly.


