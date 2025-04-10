import sys
import requests
from bs4 import BeautifulSoup
import csv
import json
import os
import re
from urllib.parse import urljoin

# Command-line flag: if '--juniors' is provided, process only junior rackets.
only_juniors = '--juniors' in sys.argv

# List of base URLs to scrape.
BASE_URLS = [
    "https://www.tennis-warehouse.com/Babolatracquets.html",
    "https://www.tennis-warehouse.com/Wilsonracquets.html",
    "https://www.tennis-warehouse.com/Headracquets.html",
    "https://www.tennis-warehouse.com/YonexRacquets.html",
    "https://www.tennis-warehouse.com/PrinceRacquets.html",
    "https://www.tennis-warehouse.com/Tecnifibreracquets.html",
    "https://www.tennis-warehouse.com/DunlopRacquets.html",
    "https://www.tennis-warehouse.com/VolklRacquets.html",
    "https://www.tennis-warehouse.com/ProKennexracquets.html",
    "https://www.tennis-warehouse.com/Solinco_Tennis_Racquets/catpage-SOLINCORAC.html",
    "https://www.tennis-warehouse.com/LacosteRacquets.html"
]

CSV_FILE = "racket_specs.csv"
JSON_FILE = "data/rackets.json"

# These are the CSV fields you want.
FIELDNAMES = [
    "racket_name", "manufacturer", "head_size_in", "head_size_cm", "length_in", "length_cm",
    "weight_oz", "weight_g", "balance_in", "balance_cm", "balance_pts", "swingweight", "stiffness",
    "beam_width_1", "beam_width_2", "beam_width_3", "composition", "power_level", "stroke_style",
    "swing_speed", "grip_type", "string_mains", "string_crosses", "stringing_instructions", "racquet_colors",
    "string_tension"
]

# Ensure that the data folder exists.
if not os.path.exists("data"):
    os.makedirs("data")

# If CSV does not exist, write header.
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, mode="w", newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()

try:
    with open(JSON_FILE, "r", encoding='utf-8') as f:
        json_data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    json_data = []

# When processing only juniors, overwrite all_specs.
if only_juniors:
    all_specs = {}
else:
    all_specs = {item["racket_name"]: item for item in json_data}

def write_racket_data(specs):
    """Update the aggregated specs and write out CSV and JSON files."""
    all_specs[specs["racket_name"]] = specs
    with open(CSV_FILE, mode="w", newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in all_specs.values():
            writer.writerow(row)
    with open(JSON_FILE, "w", encoding='utf-8') as jf:
        json.dump(list(all_specs.values()), jf, indent=2)

def extract_racket_links(base_url):
    """
    Fetches the given brand page, extracts individual racket links
    by searching for elements with a data-gtm_impression_code attribute.
    """
    try:
        response = requests.get(base_url, timeout=10)
        soup = BeautifulSoup(response.content, "html.parser")
        links = set()
        for tag in soup.find_all(attrs={"data-gtm_impression_code": True}):
            code = tag.get("data-gtm_impression_code")
            if code:
                links.add(urljoin(base_url, f"/descpage-{code}.html"))
        return list(links)
    except Exception as e:
        print(f"Error fetching {base_url}: {e}")
        return []

def parse_specs(url):
    """
    Downloads the page at URL and extracts racket specifications from the table.
    Returns a dictionary of raw specs, with the racket name extracted from the
    <title> (removing " | Tennis Warehouse").
    """
    try:
        response = requests.get(url)
        response.raise_for_status()
        html_content = response.content
    except Exception as e:
        print(f"Error retrieving URL {url}: {e}")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    
    # Find the specs table by checking its style attribute.
    table = soup.find(lambda tag: tag.name == "table" and tag.has_attr("style") and "font-size: xx-small" in tag["style"])
    if not table:
        table = soup.find("table")
        if not table:
            print("No specs table found on page.")
            return None

    raw_specs = {}
    for row in table.find_all("tr"):
        td = row.find("td")
        if td:
            strong = td.find("strong")
            if strong:
                spec_name = strong.get_text(strip=True).rstrip(':')
                strong.extract()  # Remove the label.
                spec_value = td.get_text(separator=" ", strip=True)
                raw_specs[spec_name] = spec_value

    if not raw_specs:
        print("No specifications found in the table.")
        return None

    # Extract racket name from title and clean up.
    title_tag = soup.find("title")
    if title_tag:
        racket_name = title_tag.get_text(strip=True).replace(" | Tennis Warehouse", "").strip()
    else:
        racket_name = url.split("/")[-1]
    raw_specs["racket_name"] = racket_name

    return raw_specs

def normalize_specs(raw_specs):
    """
    Normalizes the raw spec keys into the desired FIELDNAMES.
    Removes any superscript "²" from head size.
    For junior racquets (if "junior" is in the racket name), a different set
    of keys is expected.
    """
    normalized = {}
    raw_racket_name = raw_specs.get("racket_name", "").replace(" | Tennis Warehouse", "").strip()
    normalized["racket_name"] = raw_racket_name
    normalized["manufacturer"] = ""
    
    is_junior = "junior" in raw_racket_name.lower()

    if is_junior:
        # Junior racket normalization using keys like "Head Size", "Length", "Weight", etc.
        if "Head Size" in raw_specs:
            try:
                parts = raw_specs["Head Size"].replace("²", "").split("/")
                normalized["head_size_in"] = parts[0].strip().replace("in", "").strip()
                normalized["head_size_cm"] = parts[1].strip().replace("cm", "").strip()
            except Exception:
                normalized["head_size_in"] = normalized["head_size_cm"] = ""
        else:
            normalized["head_size_in"] = normalized["head_size_cm"] = ""
            
        if "Length" in raw_specs:
            try:
                parts = raw_specs["Length"].split("/")
                normalized["length_in"] = parts[0].strip().replace("in", "").strip()
                normalized["length_cm"] = parts[1].strip().replace("cm", "").strip()
            except Exception:
                normalized["length_in"] = normalized["length_cm"] = ""
        else:
            normalized["length_in"] = normalized["length_cm"] = ""
            
        if "Weight" in raw_specs:
            try:
                parts = raw_specs["Weight"].split("/")
                # Remove both "oz" and "ounces" from the first part.
                normalized["weight_oz"] = parts[0].strip().replace("oz", "").replace("ounces", "").strip()
                normalized["weight_g"] = parts[1].strip().replace("grams", "").strip()
            except Exception:
                normalized["weight_oz"] = normalized["weight_g"] = ""
        else:
            normalized["weight_oz"] = normalized["weight_g"] = ""
            
        normalized["composition"] = raw_specs.get("Composition", "").strip()
        normalized["racquet_colors"] = raw_specs.get("Racquet Colors", "").strip()
        
        if "String Pattern" in raw_specs:
            pattern = raw_specs["String Pattern"].strip()
            parts = pattern.split("/")
            if len(parts) >= 2:
                normalized["string_mains"] = parts[0].strip().split()[0]
                normalized["string_crosses"] = parts[1].strip().split()[0]
                normalized["stringing_instructions"] = " ".join(parts[1:]).strip()
            else:
                normalized["string_mains"] = normalized["string_crosses"] = normalized["stringing_instructions"] = pattern
        else:
            normalized["string_mains"] = normalized["string_crosses"] = normalized["stringing_instructions"] = ""
            
        # Junior pages typically do not have these fields.
        normalized["balance_in"] = normalized["balance_cm"] = normalized["balance_pts"] = ""
        normalized["swingweight"] = normalized["stiffness"] = ""
        normalized["beam_width_1"] = normalized["beam_width_2"] = normalized["beam_width_3"] = ""
        normalized["power_level"] = normalized["stroke_style"] = normalized["swing_speed"] = normalized["grip_type"] = ""
        normalized["string_tension"] = ""
        
    else:
        # Adult racket normalization.
        if "Head Size" in raw_specs:
            try:
                parts = raw_specs["Head Size"].replace("²", "").split("/")
                normalized["head_size_in"] = parts[0].strip().replace("in", "").strip()
                normalized["head_size_cm"] = parts[1].strip().replace("cm", "").strip()
            except Exception:
                normalized["head_size_in"] = normalized["head_size_cm"] = ""
        else:
            normalized["head_size_in"] = normalized["head_size_cm"] = ""
            
        if "Length" in raw_specs:
            try:
                parts = raw_specs["Length"].split("/")
                normalized["length_in"] = parts[0].strip().replace("in", "").strip()
                normalized["length_cm"] = parts[1].strip().replace("cm", "").strip()
            except Exception:
                normalized["length_in"] = normalized["length_cm"] = ""
        else:
            normalized["length_in"] = normalized["length_cm"] = ""
            
        if "Strung Weight" in raw_specs:
            try:
                parts = raw_specs["Strung Weight"].split("/")
                normalized["weight_oz"] = parts[0].strip().replace("oz", "").strip()
                normalized["weight_g"] = parts[1].strip().replace("g", "").strip()
            except Exception:
                normalized["weight_oz"] = normalized["weight_g"] = ""
        else:
            normalized["weight_oz"] = normalized["weight_g"] = ""
            
        if "Balance" in raw_specs:
            try:
                parts = raw_specs["Balance"].split("/")
                normalized["balance_in"] = parts[0].strip().replace("in", "").strip()
                normalized["balance_cm"] = parts[1].strip().replace("cm", "").strip()
                normalized["balance_pts"] = parts[2].strip().replace("pts HL", "").strip()
            except Exception:
                normalized["balance_in"] = normalized["balance_cm"] = normalized["balance_pts"] = ""
        else:
            normalized["balance_in"] = normalized["balance_cm"] = normalized["balance_pts"] = ""
            
        if "Swingweight" in raw_specs:
            normalized["swingweight"] = raw_specs["Swingweight"].strip()
        else:
            normalized["swingweight"] = ""
            
        if "Stiffness" in raw_specs:
            normalized["stiffness"] = raw_specs["Stiffness"].strip()
        else:
            normalized["stiffness"] = ""
            
        if "Beam Width" in raw_specs:
            try:
                parts = raw_specs["Beam Width"].split("/")
                normalized["beam_width_1"] = parts[0].strip().replace("mm", "").strip()
                normalized["beam_width_2"] = parts[1].strip().replace("mm", "").strip()
                normalized["beam_width_3"] = parts[2].strip().replace("mm", "").strip()
            except Exception:
                normalized["beam_width_1"] = normalized["beam_width_2"] = normalized["beam_width_3"] = ""
        else:
            normalized["beam_width_1"] = normalized["beam_width_2"] = normalized["beam_width_3"] = ""
            
        normalized["composition"] = raw_specs.get("Composition", "").strip()
        
        if "Power Level" in raw_specs:
            normalized["power_level"] = raw_specs["Power Level"].strip()
        else:
            normalized["power_level"] = ""
            
        if "Stroke Style" in raw_specs:
            normalized["stroke_style"] = raw_specs["Stroke Style"].strip()
        else:
            normalized["stroke_style"] = ""
            
        if "Swing Speed" in raw_specs:
            normalized["swing_speed"] = raw_specs["Swing Speed"].strip()
        else:
            normalized["swing_speed"] = ""
            
        if "Grip Type" in raw_specs:
            normalized["grip_type"] = raw_specs["Grip Type"].strip()
        else:
            normalized["grip_type"] = ""
            
        normalized["racquet_colors"] = raw_specs.get("Racquet Colors", "").strip()
        
        if "String Pattern" in raw_specs:
            pattern = raw_specs["String Pattern"].strip()
            parts = pattern.split("/")
            if len(parts) >= 2:
                normalized["string_mains"] = parts[0].strip().split()[0]
                normalized["string_crosses"] = parts[1].strip().split()[0]
                normalized["stringing_instructions"] = " ".join(parts[1:]).strip()
            else:
                normalized["string_mains"] = normalized["string_crosses"] = normalized["stringing_instructions"] = pattern
        else:
            normalized["string_mains"] = normalized["string_crosses"] = normalized["stringing_instructions"] = ""
            
        if "String Tension" in raw_specs:
            normalized["string_tension"] = raw_specs["String Tension"].strip()
        else:
            normalized["string_tension"] = ""
    
    return normalized

# Main scraping loop.
for base_url in BASE_URLS:
    print(f"Scraping from brand page: {base_url}")
    links = extract_racket_links(base_url)
    print(f"Found {len(links)} rackets")
    for link in links:
        print(f"Scraping {link}")
        raw_specs = parse_specs(link)
        print(f"Raw Specs: {raw_specs}")
        if raw_specs:
            normalized_specs = normalize_specs(raw_specs)
            # If only processing juniors, skip non-juniors.
            if only_juniors and "junior" not in normalized_specs["racket_name"].lower():
                continue
            print(f"Normalized Specs: {normalized_specs}")
            write_racket_data(normalized_specs)
