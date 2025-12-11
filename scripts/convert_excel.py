#!/usr/bin/env python3
"""
Convert Excel files to CSV
Usage: python3 scripts/convert_excel.py <input.xlsx> <output.csv>
"""

import sys
import pandas as pd

if len(sys.argv) != 3:
    print("Usage: python3 scripts/convert_excel.py <input.xlsx> <output.csv>")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2]

try:
    print(f"Reading {input_file}...")
    df = pd.read_excel(input_file)
    print(f"Found {len(df)} rows, {len(df.columns)} columns")
    print(f"Columns: {list(df.columns)}")
    
    print(f"Writing to {output_file}...")
    df.to_csv(output_file, index=False)
    print(f"✅ Successfully converted to {output_file}")
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)


