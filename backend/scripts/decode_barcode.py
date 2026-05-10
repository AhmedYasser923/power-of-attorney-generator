import json
import os
import re
import sys
from datetime import datetime, timedelta

try:
    import cv2
    import zxingcpp
except ImportError as exc:
    print(json.dumps({"success": False, "error": f"Missing dependency: {exc}"}))
    sys.exit(1)


def json_exit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def preprocess_variants(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    variants = [gray]

    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(otsu)

    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7,
    )
    variants.append(adaptive)

    blurred = cv2.GaussianBlur(gray, (0, 0), 1.0)
    sharpened = cv2.addWeighted(gray, 1.7, blurred, -0.7, 0)
    variants.append(sharpened)

    height, width = gray.shape[:2]
    if max(height, width) < 1400:
        scale = 1400 / max(height, width)
        variants.extend([
            cv2.resize(item, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            for item in list(variants)
        ])

    return variants


def rotations(image):
    return [
        image,
        cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE),
        cv2.rotate(image, cv2.ROTATE_180),
        cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE),
    ]


def format_name(result):
    return str(getattr(result, "format", "")).upper().replace("_", "").replace("-", "")


def try_decode(image):
    results = zxingcpp.read_barcodes(image)
    if not results:
        return None

    for result in results:
        if "PDF417" in format_name(result):
            return {
                "text": result.text,
                "format": str(getattr(result, "format", "PDF_417")),
            }

    first = results[0]
    return {
        "text": first.text,
        "format": str(getattr(first, "format", "UNKNOWN")),
    }


def decode_with_rotations(image):
    for variant in preprocess_variants(image):
        for rotated in rotations(variant):
            result = try_decode(rotated)
            if result:
                return result

    for rotated in rotations(image):
        result = try_decode(rotated)
        if result:
            return result

    return None


def clean_slice(raw, start, end):
    if len(raw) <= start:
        return ""
    return raw[start:end].strip()


def julian_to_date(julian_str):
    if not julian_str or not julian_str.isdigit():
        return ""

    day_of_year = int(julian_str)
    if day_of_year < 1 or day_of_year > 366:
        return ""

    year = datetime.now().year
    try:
        date = datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
        if (datetime.now() - date).days > 60:
            date = datetime(year + 1, 1, 1) + timedelta(days=day_of_year - 1)
        return date.strftime("%Y-%m-%d")
    except (OverflowError, ValueError):
        return ""


def extract_eticket(value):
    match = re.search(r"(?<!\d)(\d{13})(?!\d)", value or "")
    return match.group(1) if match else ""


def is_bcbp(raw):
    if not raw or len(raw) < 23:
        return False
    return raw[0] == "M" and raw[1].isdigit()


def parse_bcbp(raw):
    parsed = {
        "formatCode": clean_slice(raw, 0, 1),
        "numberOfLegs": 1,
        "passengerName": "",
        "electronicTicketIndicator": "",
        "pnr": "",
        "fromAirport": "",
        "toAirport": "",
        "operatingCarrier": "",
        "flightNumber": "",
        "julianDate": "",
        "flightDate": "",
        "compartmentCode": "",
        "seatNumber": "",
        "checkInSequence": "",
        "passengerStatus": "",
        "eTicketNumber": "",
    }

    if not is_bcbp(raw):
        parsed["partialParse"] = True
        parsed["nonBcbp"] = True
        parsed["eTicketNumber"] = extract_eticket(raw)
        return parsed

    try:
        parsed["numberOfLegs"] = int(clean_slice(raw, 1, 2) or "1")
    except ValueError:
        parsed["numberOfLegs"] = 1

    if len(raw) < 58:
        parsed["partialParse"] = True
        parsed["raw"] = raw
        parsed["eTicketNumber"] = extract_eticket(raw)
        return parsed

    parsed.update({
        "passengerName": clean_slice(raw, 2, 22),
        "electronicTicketIndicator": clean_slice(raw, 22, 23),
        "pnr": clean_slice(raw, 23, 30),
        "fromAirport": clean_slice(raw, 30, 33),
        "toAirport": clean_slice(raw, 33, 36),
        "operatingCarrier": clean_slice(raw, 36, 39),
        "flightNumber": clean_slice(raw, 39, 44),
        "julianDate": clean_slice(raw, 44, 47),
        "compartmentCode": clean_slice(raw, 47, 48),
        "seatNumber": clean_slice(raw, 48, 52),
        "checkInSequence": clean_slice(raw, 52, 57),
        "passengerStatus": clean_slice(raw, 57, 58),
    })
    parsed["flightDate"] = julian_to_date(parsed["julianDate"])

    conditional = raw[58:] if len(raw) > 58 else ""
    if conditional:
        parsed["conditionalRaw"] = conditional

    parsed["eTicketNumber"] = extract_eticket(conditional) or extract_eticket(raw)
    return parsed


def main():
    if len(sys.argv) < 2:
        json_exit({"success": False, "error": "No image path provided"}, 1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        json_exit({"success": False, "error": f"File not found: {image_path}"}, 1)

    image = cv2.imread(image_path)
    if image is None:
        json_exit({"success": False, "error": "Could not read image file"}, 1)

    decoded = decode_with_rotations(image)
    if not decoded:
        json_exit({
            "success": False,
            "error": "Could not decode barcode. Ensure the image is a clear, cropped screenshot of the barcode with some margin around it.",
        })

    raw = decoded["text"]
    json_exit({
        "success": True,
        "barcodeType": decoded["format"],
        "raw": raw,
        "parsed": parse_bcbp(raw),
    })


if __name__ == "__main__":
    main()
