#!/bin/bash
# Helper script to set up .env file

echo "Setting up .env file for Vercel Postgres..."
echo ""
echo "Please enter your POSTGRES_URL from Vercel:"
echo "(It should look like: postgres://default:password@host.region.postgres.vercel-storage.com:5432/verceldb)"
echo ""
read -p "POSTGRES_URL: " POSTGRES_URL

if [ -z "$POSTGRES_URL" ]; then
    echo "Error: POSTGRES_URL cannot be empty"
    exit 1
fi

cat > .env << ENVFILE
POSTGRES_URL=$POSTGRES_URL
ENVFILE

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "To verify, run: cat .env"
