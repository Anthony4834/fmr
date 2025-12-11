# Finding and Downloading FMR/SAFMR Data

## Step 1: Access HUD's FMR Data Portal

1. **Go to HUD's FMR page**: https://www.huduser.gov/portal/datasets/fmr.html

2. **Find Current Year Data**:
   - Look for "FY 2025" or "FY 2026" section (most recent)
   - FMRs are effective October 1st each year
   - Current year is typically FY 2025 (Oct 2024 - Sep 2025)

## Step 2: Download FMR Data

### Option A: County/Metro Level FMR (Recommended)

1. On the FMR page, find **"County Level Data"** or **"Metropolitan Area Data"**
2. Download the Excel or CSV file
3. Common file names:
   - `FY2025_4050_FMR.xlsx` (Excel format)
   - `fmr_2025.csv` (if CSV available)
4. Save to: `data/fmr-2025.csv` (convert Excel to CSV if needed)

### Option B: Use HUD API (Alternative)

HUD provides an API: https://www.huduser.gov/portal/dataset/fmr-api.html
- Requires API key registration
- Can fetch data programmatically
- More complex but automated

## Step 3: Download SAFMR Data

1. On the same HUD page, look for **"Small Area Fair Market Rents (SAFMR)"** section
2. Download the SAFMR dataset (ZIP code level)
3. Common file names:
   - `FY2025_SAFMR.xlsx`
   - `safmr_2025.csv`
4. Save to: `data/safmr-2025.csv`

## Step 4: Check File Format

Before ingesting, check the CSV structure:

```bash
# View first few lines
head -5 data/fmr-2025.csv
head -5 data/safmr-2025.csv
```

Look for columns like:
- Area name / County name
- State code
- Bedroom sizes (0BR, 1BR, 2BR, 3BR, 4BR)
- FMR values

## Step 5: Ingest the Data

Once you have the files:

```bash
# Ingest FMR data
bun run ingest:fmr -- --year 2025 --file ./data/fmr-2025.csv

# Ingest SAFMR data  
bun run ingest:safmr -- --year 2025 --file ./data/safmr-2025.csv
```

## Troubleshooting

### If CSV format doesn't match

The scripts have flexible column mapping, but you may need to adjust:

1. Check the actual column names in your CSV
2. Update `parseFMRCSV()` or `parseSAFMRCSV()` functions if needed
3. Common column name variations are already supported

### If Excel file instead of CSV

Convert Excel to CSV:
```bash
# Using Python (if installed)
python3 -c "import pandas as pd; pd.read_excel('data/fmr-2025.xlsx').to_csv('data/fmr-2025.csv', index=False)"

# Or use online converter, or Excel's "Save As CSV"
```

## Quick Links

- **FMR Main Page**: https://www.huduser.gov/portal/datasets/fmr.html
- **FMR API**: https://www.huduser.gov/portal/dataset/fmr-api.html
- **FMR History**: https://www.huduser.gov/portal/datasets/fmr/histread.html

## Expected Data Structure

### FMR CSV should have:
- Area/County name
- State code (2 letters)
- FMR values for 0-4 bedrooms
- Year/Fiscal year

### SAFMR CSV should have:
- ZIP code (5 digits)
- FMR values for 0-4 bedrooms
- Year/Fiscal year


