#!/bin/bash
echo "Setting up Neon database connection..."
echo ""
echo "Please paste your Neon POSTGRES_URL connection string:"
echo "(It should look like: postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require)"
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
echo "To test connection, run: bun scripts/ingest-zip-county.ts -- --url <test-url>"
