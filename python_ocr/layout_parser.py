import re
import math

class PackagingLayoutParser:
    """
    Spatial & semantic parser for packaged commodity labels under Legal Metrology Rules.
    Resolves complex scattered and diverse-font layouts:
    - Condensed, script, dot-matrix, and fine-print typography
    - Left-side key & right-side value
    - Multi-line block values (e.g. manufacturer addresses, Indian 6-digit PIN codes)
    - Standalone prominent declarations (e.g. prominent front-panel net quantity & MRP)
    - Fuzzy font misreading normalization (O/0, l/1, B/8, Rs/Bs/R5, kq/kg)
    """

    def __init__(self):
        # Flexible Legal Metrology regex patterns supporting packaging font variations
        self.re_mrp = re.compile(
            r'(?:m\.?\s*r\.?\s*p\.?|max(?:imum)?\s*retail\s*price|retail\s*price|m\.?r\.?|₹|rs\.?|inr|bs\.?|r5)\s*[:=-]?\s*(?:₹|rs\.?|inr|r5)?\s*([0-9]+(?:[\.,][0-9]{1,2})?)',
            re.IGNORECASE
        )
        self.re_tax = re.compile(
            r'(?:inc[a-z0-9]*\s*(?:of|df)?\s*(?:all)?\s*(?:t?ax[a-z]*|dut[a-z]*)|(?:tax|t?ax[a-z]*)\s*(?:inc|in|all)[a-z]*|all\s*t?ax[a-z]*\s*inc[a-z]*|\(incl[a-z\.\s]*(?:tax|axes)[a-z]*\))',
            re.IGNORECASE
        )
        self.re_net_qty = re.compile(
            r'(?:net\s*(?:qty\.?|q[a-z]*|quantity|wt\.?|weight|vol\.?|volume|contents?)|quantity|n\.?w\.?)\s*[:=-]?\s*([0-9]+(?:[\.,][0-9]+)?)\s*[\.,]?\s*([a-zA-Z]+|units?|nos?\.?|n|u)',
            re.IGNORECASE
        )
        self.re_qty_standalone = re.compile(
            r'(?:^|\b)([0-9]+(?:[\.,][0-9]+)?)\s*[\.,]?\s*(kg|kq|k9|ka|g|gm|gms|grams|grm|l|ltr|ltrs|liter|litres|ml|mlt|m1|mL|m|cm|mm|n|units?|pieces?)\b',
            re.IGNORECASE
        )
        self.re_mfg_date = re.compile(
            r'(?:mfd\.?|mfg\.?|packed(?:\s*on)?|pkd\.?|dom\.?|pack(?:ed)?\s*date|da[te]*\s*of\s*(?:mfg|mfd|pkd|packing|manufacture))\s*[:=-]?\s*([0-9]{1,2}[\/\.-][0-9]{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.,\'-]+[0-9]{2,4}|20[12][0-9])',
            re.IGNORECASE
        )
        self.re_exp_date = re.compile(
            r'(?:use\s*by|best\s*before|exp\.?|expiry\s*(?:date)?|b\.?b\.?)\s*[:=-]?\s*([0-9]{1,2}[\/\.-][0-9]{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.,\'-]+[0-9]{2,4}|[0-9]+\s*months?(?:\s*from\s*(?:mfg|pkd))?)',
            re.IGNORECASE
        )
        self.re_batch = re.compile(r'(?:b\.?\s*n[oa]\.?|batch\s*(?:n[oa]\.?|code)|lot\s*(?:n[oa]\.?|code))\s*[:=-]?\s*([a-zA-Z0-9\-\/]+)|\b([A-Z]{1,3}[0-9]{4,8})\b', re.IGNORECASE)
        self.re_origin = re.compile(r'(?:coun?tr?y\s*of\s*origi?n?c?|made\s*in|product\s*of|origi?n?c?)\s*[:=-]?\s*([a-zA-Z\s]{2,25})', re.IGNORECASE)
        self.re_phone = re.compile(r'(?:(?:tel|phone|ph|call|toll\s*free|care\s*no|helpline)\s*[:=-]?\s*)?(\+?91[\-\s]?[6-9][0-9]{9}|1800[\-\s]?[0-9]{3}[\-\s]?[0-9]{3,4}|[6-9][0-9]{9})', re.IGNORECASE)
        self.re_email = re.compile(r'([a-zA-Z0-9_.+-]+(?:\s*@\s*|\s*g\s*|\s*©\s*)[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)')
        self.re_mfg_key = re.compile(r'(?:mfd\.?\s*by|manufactured\s*(?:&|and)?\s*(?:packed\s*)?by|mfg\s*by|packed\s*by|pkd\s*by|marketed\s*by|mktd\s*by|imported\s*by|maad(?:y|by|ed)?|made\s*by)\s*[:=-]?', re.IGNORECASE)
        self.re_care_key = re.compile(r'(?:customer\s*care|consumer\s*care|for\s*complaints|in\s*case\s*of\s*feedback|consumer\s*feedback)\s*[:=-]?', re.IGNORECASE)
        self.re_commodity_key = re.compile(r'(?:commodity(?:\s*name)?|product(?:\s*name)?|item(?:\s*name)?|name\s*of\s*commodity|generic\s*name)\s*[:=-]?', re.IGNORECASE)
        self.re_commodity_fallback = re.compile(
            r'\b(perfumed\s*ta[li]c|talcu[mn]\s*pow[do]?[we]r|ta[li]c|talcum\s*powder|jasmine|wheat\s*(?:atta|flour)|atta|flour|potato\s*chips|chips|biscuits?|cookies?|soap|detergent|shampoo|edible\s*oil|mustard\s*oil|hair\s*oil|sunflower\s*oil|refined\s*oil|tea|coffee|toothpaste|tooth\s*powder|face\s*wash|cream|lotion|spices|masala|salt|sugar|honey|ghee|butter|paneer|milk|mineral\s*water|packaged\s*drinking\s*water)\b',
            re.IGNORECASE
        )
        self.re_indian_states = re.compile(
            r'\b(maharashtra|haryana|gujarat|karnataka|delhi|punjab|rajasthan|uttar\s*pradesh|madhya\s*pradesh|tamil\s*nadu|kerala|andhra\s*pradesh|telangana|west\s*bengal|bihar|odisha|assam|goa|himachal\s*pradesh|uttarakhand)\b',
            re.IGNORECASE
        )
        self.re_pincode = re.compile(r'\b[1-9][0-9]{2}\s?[0-9]{1,3}\b')
        self.re_company = re.compile(r'\b(?:pvt\.?\s*ltd|ltd|llp|industries|foods|agro|products|enterprises|works|mills|beverages|foundation|ayurveda|laboratories|pharma)\b', re.IGNORECASE)
        self.re_usp = re.compile(
            r'(?:u\.?\s*s\.?\s*p\.?|un[it]*\s*sal?e?\s*pri[ce]*|unique\s*sell(?:ing)?\s*price|unit\s*price|unt\s*saleprie)\s*[:=-]?\s*(?:₹|rs\.?|inr)?\s*([0-9]+(?:[\.,][0-9]{1,3})?)\s*(?:\/|\s*per\s*|\s*)\s*([a-zA-Z0-9]+(?:[ \t]+[a-zA-Z]+)?)',
            re.IGNORECASE
        )
        self.re_usp_standalone = re.compile(
            r'(?:₹|rs\.?|inr)?\s*([0-9]+(?:[\.,][0-9]{1,3})?)\s*(?:\/|\s*per\s*)\s*(?:100\s*g|100\s*ml|kg|g|gm|gms|ml|l|ltr|unit|piece|u|n)\b',
            re.IGNORECASE
        )
        self.re_product_addr_key = re.compile(
            r'(?:mfd\.?\s*at|manufactured\s*at|packed\s*at|pkd\s*at|factory\s*(?:address|at)|unit\s*(?:address|at)|premises\s*at|facility\s*at|mfg\s*unit|prod(?:uct)?\s*addr(?:ess)?)\s*[:=-]?',
            re.IGNORECASE
        )

    def _normalize_box(self, box):
        """
        Calculates bounding polygon properties: [x_min, y_min, x_max, y_max, center_x, center_y, width, height]
        """
        pts = box['box']
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        w = max(1.0, x_max - x_min)
        h = max(1.0, y_max - y_min)
        cx = (x_min + x_max) / 2.0
        cy = (y_min + y_max) / 2.0
        return {
            'pts': pts,
            'text': box['text'].strip(),
            'confidence': float(box['confidence']),
            'x_min': x_min,
            'y_min': y_min,
            'x_max': x_max,
            'y_max': y_max,
            'w': w,
            'h': h,
            'cx': cx,
            'cy': cy
        }

    def _normalize_unit(self, unit_str):
        u = unit_str.strip().lower()
        if u in ['kq', 'k9', 'ka']:
            return 'kg'
        if u in ['m1', 'mlt']:
            return 'ml'
        if u in ['grm', 'gms', 'gm']:
            return u
        return u

    def parse(self, raw_boxes, image_width=800, image_height=600):
        if not raw_boxes:
            return self._empty_result()

        boxes = [self._normalize_box(b) for b in raw_boxes if b.get('text', '').strip()]
        if not boxes:
            return self._empty_result()

        # Group boxes into horizontal bands (rows)
        # Vertical overlap threshold of 35% accommodates mixed ascender/descender font styles
        rows = []
        sorted_boxes = sorted(boxes, key=lambda b: b['y_min'])

        for b in sorted_boxes:
            placed = False
            for row in rows:
                row_y_min = min(item['y_min'] for item in row)
                row_y_max = max(item['y_max'] for item in row)
                overlap = min(b['y_max'], row_y_max) - max(b['y_min'], row_y_min)
                min_h = min(b['h'], (row_y_max - row_y_min))
                if overlap > 0 and (overlap / min_h) >= 0.35:
                    row.append(b)
                    placed = True
                    break
            if not placed:
                rows.append([b])

        # Sort each row left-to-right
        structured_rows = []
        for row in rows:
            sorted_row = sorted(row, key=lambda b: b['x_min'])
            structured_rows.append(sorted_row)

        # Build full raw text line by line
        raw_lines = []
        for row in structured_rows:
            line_str = " ".join([b['text'] for b in row])
            raw_lines.append(line_str)
        full_text = "\n".join(raw_lines)

        result = {
            'commodityName': '',
            'netQuantity': '',
            'declaredQuantity': '',
            'unit': '',
            'mrp': '',
            'mrpNumeric': None,
            'hasInclusiveOfTaxes': False,
            'unitSalePrice': '',
            'mfgDate': '',
            'expDate': '',
            'manufacturer': '',
            'productAddress': '',
            'countryOfOrigin': '',
            'customerCarePhone': '',
            'customerCareEmail': '',
            'customerCareAddress': '',
            'batchNo': '',
            'estimatedFontHeightMm': 2.5
        }

        # Check for Tax declaration in full text
        if self.re_tax.search(full_text):
            result['hasInclusiveOfTaxes'] = True

        # Check Country of origin
        origin_m = self.re_origin.search(full_text)
        if origin_m:
            raw_country = origin_m.group(1).strip()
            clean_country = re.split(r'[\n\r,.]', raw_country)[0].strip().title()
            if any(x in clean_country.lower() for x in ['inda', 'indi', 'eipu', 'ndia', 'ind', 'dia']):
                clean_country = "India"
            result['countryOfOrigin'] = clean_country
        elif re.search(r'\b(made\s*in\s*india|product\s*of\s*india|made\s*in\s*inda)\b', full_text, re.IGNORECASE):
            result['countryOfOrigin'] = "India"
        elif re.search(r'\b(india|inda)\b', full_text, re.IGNORECASE):
            result['countryOfOrigin'] = "India"

        # Check Batch No
        batch_m = self.re_batch.search(full_text)
        if batch_m:
            result['batchNo'] = (batch_m.group(1) or batch_m.group(2) or '').strip()

        # Check Consumer Care
        email_m = self.re_email.search(full_text)
        if email_m:
            result['customerCareEmail'] = email_m.group(1).strip()
        else:
            spaced_email = re.search(r'([a-zA-Z0-9_.+-]+\s*@\s*[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)', full_text)
            if spaced_email:
                result['customerCareEmail'] = spaced_email.group(1).replace(' ', '').strip()

        phone_m = self.re_phone.search(full_text)
        if phone_m:
            result['customerCarePhone'] = phone_m.group(1).strip()

        # Scan row-by-row for Left-Key Right-Value and contiguous blocks
        for i, row in enumerate(structured_rows):
            row_text = " ".join([b['text'] for b in row])

            # 1. Net Quantity: Either on same row or right-side column
            if not result['netQuantity']:
                qty_match = self.re_net_qty.search(row_text)
                if qty_match:
                    num = qty_match.group(1).replace(',', '.')
                    unit = self._normalize_unit(qty_match.group(2))
                    result['declaredQuantity'] = num
                    result['unit'] = unit
                    result['netQuantity'] = f"{num} {unit}"
                else:
                    # Check if left box has 'Net Wt' / 'Net Qty' and right box has value
                    for idx, b in enumerate(row):
                        if re.search(r'(?:net\s*(?:qty\.?|quantity|wt\.?|weight|volume|contents?)|n\.?w\.?)', b['text'], re.IGNORECASE):
                            if idx + 1 < len(row):
                                next_text = row[idx + 1]['text']
                                sm = self.re_qty_standalone.search(next_text.strip()) or self.re_net_qty.search(next_text)
                                if sm:
                                    num = sm.group(1).replace(',', '.')
                                    unit = self._normalize_unit(sm.group(2))
                                    result['declaredQuantity'] = num
                                    result['unit'] = unit
                                    result['netQuantity'] = f"{num} {unit}"
                                    break
                            elif i + 1 < len(structured_rows):
                                next_row_text = " ".join([nb['text'] for nb in structured_rows[i+1]])
                                sm = self.re_qty_standalone.search(next_row_text.strip()) or self.re_net_qty.search(next_row_text)
                                if sm:
                                    num = sm.group(1).replace(',', '.')
                                    unit = self._normalize_unit(sm.group(2))
                                    result['declaredQuantity'] = num
                                    result['unit'] = unit
                                    result['netQuantity'] = f"{num} {unit}"
                                    break

            # 2. MRP: Left-side or embedded
            if not result['mrp']:
                mrp_match = self.re_mrp.search(row_text)
                if mrp_match:
                    price_val = mrp_match.group(1).replace(',', '.')
                    try:
                        result['mrpNumeric'] = float(price_val)
                    except ValueError:
                        pass
                    result['mrp'] = f"Rs. {price_val}"
                    if self.re_tax.search(row_text):
                        result['hasInclusiveOfTaxes'] = True
                        result['mrp'] += " (Inclusive of all taxes)"
                else:
                    for idx, b in enumerate(row):
                        if re.search(r'^(?:m\.?\s*r\.?\s*p\.?|max(?:imum)?\s*retail\s*price|retail\s*price)$', b['text'].strip(), re.IGNORECASE):
                            if idx + 1 < len(row):
                                val_text = row[idx+1]['text']
                                num_search = re.search(r'([0-9]+(?:[\.,][0-9]{1,2})?)', val_text)
                                if num_search:
                                    val = num_search.group(1).replace(',', '.')
                                    result['mrpNumeric'] = float(val)
                                    result['mrp'] = f"Rs. {val}"
                                    if self.re_tax.search(row_text) or self.re_tax.search(val_text):
                                        result['hasInclusiveOfTaxes'] = True
                                        result['mrp'] += " (Inclusive of all taxes)"

            # 3. Mfg Date / Packed Date
            if not result['mfgDate']:
                mfg_match = self.re_mfg_date.search(row_text)
                if mfg_match:
                    result['mfgDate'] = mfg_match.group(1).strip()
                else:
                    for idx, b in enumerate(row):
                        if re.search(r'(?:mfd\.?|mfg\.?|packed(?:\s*on)?|pkd\.?|dom\.?|date\s*of\s*(?:mfg|mfd|pkd|packing))', b['text'].strip(), re.IGNORECASE):
                            if idx + 1 < len(row):
                                val_text = row[idx+1]['text'].strip()
                                dsearch = re.search(r'([0-9]{1,2}[\/\.-][0-9]{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.,\'-]+[0-9]{2,4}|[0-9]{2,4})', val_text, re.IGNORECASE)
                                if dsearch:
                                    result['mfgDate'] = dsearch.group(1).strip()
                                    break
                                else:
                                    result['mfgDate'] = val_text
                                    break
                            elif i + 1 < len(structured_rows):
                                next_row_text = " ".join([nb['text'] for nb in structured_rows[i+1]]).strip()
                                dsearch = re.search(r'([0-9]{1,2}[\/\.-][0-9]{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\.,\'-]+[0-9]{2,4}|[0-9]{2,4})', next_row_text, re.IGNORECASE)
                                if dsearch:
                                    result['mfgDate'] = dsearch.group(1).strip()
                                    break

            # 4. Expiry / Best Before
            if not result['expDate']:
                exp_match = self.re_exp_date.search(row_text)
                if exp_match:
                    result['expDate'] = exp_match.group(1).strip()
                else:
                    for idx, b in enumerate(row):
                        if re.search(r'(?:use\s*by|best\s*before|exp\.?|expiry|b\.?b\.?)', b['text'].strip(), re.IGNORECASE):
                            if idx + 1 < len(row):
                                result['expDate'] = row[idx+1]['text'].strip()
                                break
                            elif i + 1 < len(structured_rows):
                                next_row_text = " ".join([nb['text'] for nb in structured_rows[i+1]]).strip()
                                dsearch = re.search(r'([0-9]{1,2}[\/\.-][0-9]{2,4}|[0-9]+\s*months?)', next_row_text, re.IGNORECASE)
                                if dsearch:
                                    result['expDate'] = dsearch.group(0).strip()
                                    break

            # 5. Manufacturer / Packer Info Block
            if not result['manufacturer']:
                if self.re_mfg_key.search(row_text):
                    clean_line = self.re_mfg_key.sub('', row_text).strip()
                    mfg_lines = []
                    if clean_line:
                        mfg_lines.append(clean_line)
                    for next_idx in range(i + 1, min(i + 4, len(structured_rows))):
                        next_line = " ".join([b['text'] for b in structured_rows[next_idx]]).strip()
                        if re.search(r'(?:m\.?r\.?p|net\s*wt|customer\s*care|b\.?\s*no|country\s*of)', next_line, re.IGNORECASE):
                            break
                        if next_line:
                            mfg_lines.append(next_line)
                    if mfg_lines:
                        result['manufacturer'] = ", ".join(mfg_lines)

            # 6. Customer Care block
            if not result['customerCareAddress']:
                if self.re_care_key.search(row_text):
                    clean_care = self.re_care_key.sub('', row_text).strip()
                    care_lines = []
                    if clean_care:
                        care_lines.append(clean_care)
                    for next_idx in range(i + 1, min(i + 3, len(structured_rows))):
                        next_line = " ".join([b['text'] for b in structured_rows[next_idx]]).strip()
                        if re.search(r'(?:m\.?r\.?p|net\s*wt|mfd|batch)', next_line, re.IGNORECASE):
                            break
                        if next_line:
                            care_lines.append(next_line)
                    if care_lines:
                        result['customerCareAddress'] = ", ".join(care_lines)

            # 7. Commodity Name
            if not result['commodityName']:
                comm_match = self.re_commodity_key.search(row_text)
                if comm_match:
                    clean_comm = self.re_commodity_key.sub('', row_text).strip()
                    if clean_comm:
                        result['commodityName'] = clean_comm
                    elif idx + 1 < len(row):
                        result['commodityName'] = row[idx+1]['text'].strip()

            # 8. Unit Sale Price (USP / Unique Sell Price)
            if not result['unitSalePrice']:
                usp_match = self.re_usp.search(row_text)
                if usp_match:
                    result['unitSalePrice'] = f"Rs. {usp_match.group(1)} / {usp_match.group(2).strip()}"
                else:
                    for idx, b in enumerate(row):
                        if re.search(r'^(?:u\.?\s*s\.?\s*p\.?|unit\s*sal?e?\s*price|unique\s*sell(?:ing)?\s*price|unit\s*price)$', b['text'].strip(), re.IGNORECASE):
                            if idx + 1 < len(row):
                                val_text = row[idx+1]['text'].strip()
                                result['unitSalePrice'] = val_text
                                break
                            elif i + 1 < len(structured_rows):
                                next_row_text = " ".join([nb['text'] for nb in structured_rows[i+1]]).strip()
                                result['unitSalePrice'] = next_row_text
                                break

            # 9. Product / Manufacturing Premises Address
            if not result['productAddress']:
                if self.re_product_addr_key.search(row_text):
                    clean_addr = self.re_product_addr_key.sub('', row_text).strip()
                    addr_lines = []
                    if clean_addr:
                        addr_lines.append(clean_addr)
                    for next_idx in range(i + 1, min(i + 3, len(structured_rows))):
                        next_line = " ".join([b['text'] for b in structured_rows[next_idx]]).strip()
                        if re.search(r'(?:m\.?r\.?p|net\s*wt|customer\s*care|b\.?\s*no|country\s*of|batch|u\.?s\.?p)', next_line, re.IGNORECASE):
                            break
                        if next_line:
                            addr_lines.append(next_line)
                    if addr_lines:
                        result['productAddress'] = ", ".join(addr_lines)

        # Fallback 1: Standalone prominent quantity detection (e.g. "500 g" or "5 kg" printed without "Net Qty" key)
        if not result['netQuantity']:
            for b in boxes:
                text_clean = b['text'].strip()
                match = self.re_qty_standalone.search(text_clean)
                if match:
                    # Ignore if part of an address or street number
                    if not re.search(r'(?:plot|sector|road|street|nagar|ward|phase)', text_clean, re.IGNORECASE):
                        num = match.group(1).replace(',', '.')
                        unit = self._normalize_unit(match.group(2))
                        result['declaredQuantity'] = num
                        result['unit'] = unit
                        result['netQuantity'] = f"{num} {unit}"
                        break

        # Fallback 2: Standalone Indian Manufacturer Address via Company + PIN Code / State heuristic
        if not result['manufacturer']:
            for i, row in enumerate(structured_rows):
                line = " ".join([b['text'] for b in row]).strip()
                if self.re_company.search(line) or self.re_mfg_key.search(line) or re.search(r'marketed\s*by', line, re.IGNORECASE) or self.re_pincode.search(line) or self.re_indian_states.search(line):
                    addr_lines = [self.re_mfg_key.sub('', line).strip()]
                    for next_idx in range(i + 1, min(i + 4, len(structured_rows))):
                        nline = " ".join([b['text'] for b in structured_rows[next_idx]]).strip()
                        if not re.search(r'(?:mrp|net\s*wt|batch|phone|customer\s*care|exp\b)', nline, re.IGNORECASE):
                            addr_lines.append(nline)
                    result['manufacturer'] = ", ".join([al for al in addr_lines if al])
                    break

        # Fallback 3: Commodity Name (Keyword lexicon or Top prominent line)
        if not result['commodityName']:
            comm_kw = self.re_commodity_fallback.search(full_text)
            if comm_kw:
                raw_match = comm_kw.group(0).strip().lower()
                if 'taic' in raw_match or 'talc' in raw_match:
                    result['commodityName'] = "Perfumed Talc" if "perfum" in full_text.lower() else "Talcum Powder"
                elif 'jasmine' in raw_match:
                    result['commodityName'] = "Jasmine Perfumed Talc"
                elif 'flour' in raw_match or 'atta' in raw_match:
                    result['commodityName'] = "Wheat Flour"
                else:
                    result['commodityName'] = comm_kw.group(0).strip().title()
            elif len(structured_rows) > 0:
                for r in structured_rows[:4]:
                    cand = " ".join([b['text'] for b in r]).strip()
                    if len(cand) >= 3 and not re.search(r'(?:mrp|net|mfd|batch|phone|email|care|rs\.|pvt|ltd|marketed|date|exp|fssai)', cand, re.IGNORECASE) and re.search(r'[a-zA-Z]{3,}', cand):
                        result['commodityName'] = cand
                        break

        # Fallback 4: Unit Sale Price (USP) from full text
        if not result['unitSalePrice']:
            usp_full = self.re_usp.search(full_text)
            if usp_full:
                result['unitSalePrice'] = f"Rs. {usp_full.group(1)} / {usp_full.group(2).strip()}"
            else:
                usp_std = self.re_usp_standalone.search(full_text)
                if usp_std:
                    result['unitSalePrice'] = usp_std.group(0).strip()

        # Fallback 5: Product / Manufacturing Premises Address
        if not result['productAddress']:
            addr_m = self.re_product_addr_key.search(full_text)
            if addr_m:
                rem = full_text[addr_m.end():].strip().split('\n')[0].strip()
                if len(rem) > 5:
                    result['productAddress'] = rem
            elif result['manufacturer'] and (self.re_pincode.search(result['manufacturer']) or self.re_indian_states.search(result['manufacturer']) or re.search(r'(?:sector|plot|industrial|road|street|nagar|ward|village|dist|state)', result['manufacturer'], re.IGNORECASE) or len(result['manufacturer']) > 8):
                result['productAddress'] = result['manufacturer']

        # Fallback 6: Country of Origin from full text / state / PIN code
        if not result['countryOfOrigin']:
            if re.search(r'\b(india|bharat)\b', full_text, re.IGNORECASE) or self.re_indian_states.search(full_text) or self.re_pincode.search(full_text):
                result['countryOfOrigin'] = "India"

        # Fallback 7: MRP & Taxes from full text
        if not result['mrp']:
            mrp_full = self.re_mrp.search(full_text)
            if mrp_full:
                val = mrp_full.group(1).replace(',', '.')
                try:
                    result['mrpNumeric'] = float(val)
                except ValueError:
                    pass
                result['mrp'] = f"Rs. {val}"
                if result['hasInclusiveOfTaxes']:
                    result['mrp'] += " (Inclusive of all taxes)"

        # Fallback 8: Mfg / Packing Date from full text
        if not result['mfgDate']:
            dt_full = self.re_mfg_date.search(full_text)
            if dt_full:
                result['mfgDate'] = dt_full.group(1).strip()

        # Fallback 9: Batch No from full text
        if not result['batchNo']:
            b_full = self.re_batch.search(full_text)
            if b_full:
                result['batchNo'] = (b_full.group(1) or b_full.group(2) or '').strip()

        # Estimate average numeral font height in mm assuming standard label DPI
        qty_boxes = [b for b in boxes if re.search(r'[0-9]+', b['text'])]
        if qty_boxes:
            avg_px_height = sum(b['h'] for b in qty_boxes) / len(qty_boxes)
            result['estimatedFontHeightMm'] = round(max(1.0, (avg_px_height / max(1, image_height)) * 120.0), 1)

        # Post-clean strings
        for k in ['commodityName', 'manufacturer', 'customerCareAddress', 'netQuantity', 'mrp', 'unitSalePrice', 'productAddress']:
            if isinstance(result[k], str):
                result[k] = re.sub(r'^[.:;,\-\s]+', '', result[k]).strip()
        if result['commodityName']:
            result['commodityName'] = re.sub(r'^(?:name|commodity|item)\s*[:=-]?\s*', '', result['commodityName'], flags=re.IGNORECASE).strip()

        return result, full_text

    def _empty_result(self):
        return {
            'commodityName': '',
            'netQuantity': '',
            'declaredQuantity': '',
            'unit': '',
            'mrp': '',
            'mrpNumeric': None,
            'hasInclusiveOfTaxes': False,
            'unitSalePrice': '',
            'mfgDate': '',
            'expDate': '',
            'manufacturer': '',
            'productAddress': '',
            'countryOfOrigin': '',
            'customerCarePhone': '',
            'customerCareEmail': '',
            'customerCareAddress': '',
            'batchNo': '',
            'estimatedFontHeightMm': 2.5
        }, ""
