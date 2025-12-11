# Setting Up Neon Database

You've set up a Neon database. Here's how to connect it to your project.

## Quick Setup

### 1. Create .env File

If you have your Neon connection string, create a `.env` file:

```bash
# Create .env file with your Neon connection string
echo "POSTGRES_URL=your_neon_connection_string_here" > .env
```

Or manually create `.env`:
```bash
POSTGRES_URL=postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### 2. Get Your Neon Connection String

1. Go to your Neon dashboard: https://console.neon.tech
2. Select your project
3. Go to **"Connection Details"** or **"Connection String"**
4. Copy the connection string (it should include `?sslmode=require`)

### 3. Test Connection

```bash
# Test database connection
bun scripts/ingest-zip-county.ts -- --url <test-url>
```

This will:
- Load `.env` file
- Connect to Neon database
- Create the schema automatically
- Show any connection errors

## Initialize Database Schema

Once connected, initialize the schema:

```bash
# This will create all tables and indexes
bun scripts/ingest-zip-county.ts -- --url <data-url>
```

Or create a simple schema initialization script:

```bash
# Create a simple init script
bun -e "
import { config } from 'dotenv';
import { createSchema } from './lib/schema';
import { configureDatabase } from './lib/db';

config();
if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL not set');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });
await createSchema();
console.log('Schema created successfully!');
"
```

## Neon vs Vercel Postgres

Neon is a great choice! Benefits:
- ✅ Serverless Postgres
- ✅ Generous free tier
- ✅ Auto-scaling
- ✅ Works great with Vercel deployments
- ✅ Branching support (dev/staging/prod databases)

## Environment Variables for Vercel

When deploying to Vercel, add your Neon connection string:

1. Go to Vercel project → Settings → Environment Variables
2. Add:
   - **Name**: `POSTGRES_URL`
   - **Value**: Your Neon connection string
   - **Environment**: All (Production, Preview, Development)

## Connection String Format

Neon connection strings typically look like:
```
postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require
```

Make sure it includes `?sslmode=require` for SSL connection.

## Troubleshooting

### Connection Timeout
- Check your Neon project is active
- Verify connection string is correct
- Ensure `sslmode=require` is in the connection string

### SSL Errors
- Neon requires SSL connections
- Make sure connection string includes `?sslmode=require`

### Authentication Errors
- Verify username and password in connection string
- Check Neon dashboard for correct credentials

## Next Steps

1. ✅ Create `.env` file with Neon connection string
2. ✅ Test connection
3. ✅ Initialize schema
4. ✅ Run data ingestion scripts
5. ✅ Deploy to Vercel with Neon connection string


