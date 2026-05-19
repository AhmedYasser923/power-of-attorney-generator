import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta

try:
    import cv2
    import numpy as np
    import zxingcpp
except ImportError as exc:
    print(json.dumps({"success": False, "error": f"Missing dependency: {exc}"}))
    sys.exit(1)


MAX_INTERNAL_SECONDS = float(os.environ.get("BARCODE_DECODE_INTERNAL_SECONDS", "24"))
MAX_DECODE_ATTEMPTS = int(os.environ.get("BARCODE_DECODE_MAX_ATTEMPTS", "420"))
MAX_REGION_BOXES = int(os.environ.get("BARCODE_REGION_BOXES", "12"))


def json_exit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def as_int(value):
    return int(value) if isinstance(value, (np.integer,)) else value


def as_float(value):
    return float(value) if isinstance(value, (np.floating, np.integer)) else value


def gray_image(image):
    if image is None:
        return None
    if len(image.shape) == 2:
        return image
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def format_name(result):
    return str(getattr(result, "format", "")).upper().replace("_", "").replace("-", "")


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
    text = value or ""
    match = re.search(r"(?<!\d)(\d{13})(?!\d)", text)
    if match:
        return match.group(1)

    extended_match = re.search(r"(?<!\d)(\d{14,16})(?!\d)", text)
    if not extended_match:
        return ""

    run = extended_match.group(1)
    candidate = run[:13]
    if candidate.startswith("000") or len(set(candidate)) <= 1:
        return ""
    return candidate


def is_bcbp(raw):
    if not raw or len(raw) < 23:
        return False
    return raw[0] == "M" and raw[1].isdigit()


def validate_bcbp(raw):
    if not is_bcbp(raw):
        return {"valid": False, "reason": "not_bcbp"}

    if len(raw) < 58:
        return {"valid": False, "reason": "too_short"}

    from_airport = clean_slice(raw, 30, 33)
    to_airport = clean_slice(raw, 33, 36)
    carrier = clean_slice(raw, 36, 39)
    flight_number = clean_slice(raw, 39, 44)
    julian_date = clean_slice(raw, 44, 47)

    if not re.fullmatch(r"[A-Z]{3}", from_airport or ""):
        return {"valid": False, "reason": "invalid_from_airport"}
    if not re.fullmatch(r"[A-Z]{3}", to_airport or ""):
        return {"valid": False, "reason": "invalid_to_airport"}
    if not re.fullmatch(r"[A-Z0-9]{2,3}", carrier or ""):
        return {"valid": False, "reason": "invalid_carrier"}
    if not re.search(r"\d", flight_number or ""):
        return {"valid": False, "reason": "invalid_flight_number"}
    if not julian_to_date(julian_date):
        return {"valid": False, "reason": "invalid_flight_date"}

    return {"valid": True, "reason": "bcbp_structure_matched"}


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

    validation = validate_bcbp(raw)
    parsed["validation"] = validation

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


def quality_metrics(image):
    gray = gray_image(image)
    height, width = gray.shape[:2]
    work = gray
    longest = max(height, width)
    if longest > 1200:
        scale = 1200 / longest
        work = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    return {
        "width": as_int(width),
        "height": as_int(height),
        "longestSide": as_int(longest),
        "blurScore": round(float(cv2.Laplacian(work, cv2.CV_64F).var()), 2),
        "contrastScore": round(float(work.std()), 2),
        "originalPreserved": True,
    }


def resize_to_max(image, max_side):
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return image, 1.0
    scale = max_side / longest
    resized = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return resized, scale


def add_quiet_zone(image, ratio=0.06):
    height, width = image.shape[:2]
    border = max(12, int(max(height, width) * ratio))
    color = 255 if len(image.shape) == 2 else (255, 255, 255)
    return cv2.copyMakeBorder(image, border, border, border, border, cv2.BORDER_CONSTANT, value=color)


def rotate_bound(image, angle):
    height, width = image.shape[:2]
    center = (width / 2, height / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = abs(matrix[0, 0])
    sin = abs(matrix[0, 1])
    new_width = int((height * sin) + (width * cos))
    new_height = int((height * cos) + (width * sin))
    matrix[0, 2] += (new_width / 2) - center[0]
    matrix[1, 2] += (new_height / 2) - center[1]
    color = 255 if len(image.shape) == 2 else (255, 255, 255)
    return cv2.warpAffine(
        image,
        matrix,
        (new_width, new_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=color,
    )


def orthogonal_rotations(image):
    return [
        (image, "0"),
        (cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE), "90"),
        (cv2.rotate(image, cv2.ROTATE_180), "180"),
        (cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE), "270"),
    ]


def order_points(points):
    rect = np.zeros((4, 2), dtype="float32")
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1)
    rect[0] = points[np.argmin(sums)]
    rect[2] = points[np.argmax(sums)]
    rect[1] = points[np.argmin(diffs)]
    rect[3] = points[np.argmax(diffs)]
    return rect


def four_point_transform(image, points):
    rect = order_points(points.astype("float32"))
    top_left, top_right, bottom_right, bottom_left = rect

    width_a = np.linalg.norm(bottom_right - bottom_left)
    width_b = np.linalg.norm(top_right - top_left)
    max_width = int(max(width_a, width_b))

    height_a = np.linalg.norm(top_right - bottom_right)
    height_b = np.linalg.norm(top_left - bottom_left)
    max_height = int(max(height_a, height_b))

    if max_width < 24 or max_height < 24:
        return None

    destination = np.array(
        [
            [0, 0],
            [max_width - 1, 0],
            [max_width - 1, max_height - 1],
            [0, max_height - 1],
        ],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, destination)
    warped = cv2.warpPerspective(image, matrix, (max_width, max_height), borderValue=(255, 255, 255))
    return add_quiet_zone(warped)


def crop_from_box(image, points, pad_ratio=0.08):
    x, y, width, height = cv2.boundingRect(points.astype("int32"))
    pad = max(12, int(max(width, height) * pad_ratio))
    image_height, image_width = image.shape[:2]
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(image_width, x + width + pad)
    y2 = min(image_height, y + height + pad)
    if x2 - x1 < 24 or y2 - y1 < 24:
        return None
    return image[y1:y2, x1:x2].copy()


def rect_iou(rect_a, rect_b):
    ax, ay, aw, ah = rect_a
    bx, by, bw, bh = rect_b
    inter_x1 = max(ax, bx)
    inter_y1 = max(ay, by)
    inter_x2 = min(ax + aw, bx + bw)
    inter_y2 = min(ay + ah, by + bh)
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)
    if inter_area <= 0:
        return 0
    area_a = aw * ah
    area_b = bw * bh
    return inter_area / max(1, area_a + area_b - inter_area)


def contour_boxes(mask, label, work_shape):
    contours_info = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = contours_info[-2]
    image_height, image_width = work_shape[:2]
    image_area = image_height * image_width
    boxes = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 700:
            continue

        rect = cv2.minAreaRect(contour)
        (center_x, center_y), (rect_width, rect_height), angle = rect
        if rect_width < 20 or rect_height < 20:
            continue

        rect_area = rect_width * rect_height
        if rect_area <= 0:
            continue

        area_ratio = rect_area / image_area
        if area_ratio < 0.001 or area_ratio > 0.92:
            continue

        aspect = max(rect_width, rect_height) / max(1, min(rect_width, rect_height))
        if aspect > 30:
            continue

        extent = area / rect_area
        if extent < 0.12:
            continue

        x, y, width, height = cv2.boundingRect(contour)
        score = (area_ratio * 120) + (min(aspect, 8) * 1.7) + (extent * 12)
        if 1.0 <= aspect <= 1.4:
            score += 4
        if aspect >= 1.8:
            score += 6

        boxes.append({
            "box": cv2.boxPoints(rect),
            "axisRect": (x, y, width, height),
            "score": float(score),
            "label": label,
            "angle": float(angle),
        })

    return boxes


def detect_region_boxes(image):
    work, scale = resize_to_max(image, 1800)
    gray = gray_image(work)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    blurred = cv2.GaussianBlur(clahe, (5, 5), 0)

    grad_x = cv2.convertScaleAbs(cv2.Sobel(blurred, cv2.CV_32F, 1, 0, ksize=-1))
    grad_y = cv2.convertScaleAbs(cv2.Sobel(blurred, cv2.CV_32F, 0, 1, ksize=-1))
    edges = cv2.Canny(blurred, 60, 180)

    masks = []
    for label, source in (("x_gradient", grad_x), ("y_gradient", grad_y)):
        source = cv2.GaussianBlur(source, (9, 9), 0)
        _, threshold = cv2.threshold(source, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        for kernel_label, kernel in (
            ("wide", cv2.getStructuringElement(cv2.MORPH_RECT, (35, 9))),
            ("tall", cv2.getStructuringElement(cv2.MORPH_RECT, (9, 35))),
            ("square", cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))),
        ):
            closed = cv2.morphologyEx(threshold, cv2.MORPH_CLOSE, kernel)
            closed = cv2.erode(closed, None, iterations=1)
            closed = cv2.dilate(closed, None, iterations=2)
            masks.append((f"{label}_{kernel_label}", closed))

    edge_mask = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11)), iterations=2)
    masks.append(("edge_density", edge_mask))

    boxes = []
    seen_rects = []
    for label, mask in masks:
        for item in contour_boxes(mask, label, work.shape):
            if any(rect_iou(item["axisRect"], existing) > 0.68 for existing in seen_rects):
                continue
            seen_rects.append(item["axisRect"])
            if scale != 1.0:
                item["box"] = item["box"] / scale
                x, y, width, height = item["axisRect"]
                item["axisRect"] = (
                    int(x / scale),
                    int(y / scale),
                    int(width / scale),
                    int(height / scale),
                )
            boxes.append(item)

    boxes.sort(key=lambda item: item["score"], reverse=True)
    return boxes[:MAX_REGION_BOXES]


def broad_crop_sources(image):
    height, width = image.shape[:2]
    if max(height, width) < 900:
        return []

    crops = []
    bands = [
        ("center_80", 0.1, 0.1, 0.9, 0.9),
        ("top_65", 0.0, 0.0, 1.0, 0.65),
        ("bottom_65", 0.0, 0.35, 1.0, 1.0),
        ("middle_band", 0.0, 0.22, 1.0, 0.78),
    ]

    for label, left, top, right, bottom in bands:
        x1 = int(width * left)
        y1 = int(height * top)
        x2 = int(width * right)
        y2 = int(height * bottom)
        crop = image[y1:y2, x1:x2].copy()
        if crop.shape[0] >= 60 and crop.shape[1] >= 60:
            crops.append({
                "image": crop,
                "source": f"broad_crop:{label}",
                "sourceKind": "broad_crop",
                "transform": "axis_crop",
            })

    return crops


def region_sources(image):
    sources = []
    boxes = detect_region_boxes(image)

    for index, item in enumerate(boxes):
        box = item["box"].astype("float32")
        crop = crop_from_box(image, box)
        if crop is not None:
            sources.append({
                "image": crop,
                "source": f"region:{index + 1}:{item['label']}",
                "sourceKind": "region_crop",
                "transform": "crop",
                "regionScore": round(item["score"], 2),
            })

        if index < 8:
            warped = four_point_transform(image, box)
            if warped is not None:
                sources.append({
                    "image": warped,
                    "source": f"region:{index + 1}:{item['label']}",
                    "sourceKind": "region_perspective",
                    "transform": "perspective",
                    "regionScore": round(item["score"], 2),
                })

    return sources, len(boxes)


def preprocess_variants(image):
    gray = gray_image(image)
    if max(gray.shape[:2]) > 2400:
        gray, _ = resize_to_max(gray, 2400)

    variants = [
        (gray, "gray", False),
    ]

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    variants.append((clahe, "clahe", False))

    blurred = cv2.GaussianBlur(gray, (0, 0), 1.0)
    sharpened = cv2.addWeighted(gray, 1.7, blurred, -0.7, 0)
    variants.append((sharpened, "sharpen", False))

    if gray.shape[0] * gray.shape[1] <= 3500000:
        denoised = cv2.fastNlMeansDenoising(gray, None, 7, 7, 21)
        variants.append((denoised, "denoise", True))

    _, otsu = cv2.threshold(clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append((otsu, "otsu", True))

    adaptive = cv2.adaptiveThreshold(
        clahe,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        7,
    )
    variants.append((adaptive, "adaptive_31", True))

    adaptive_wide = cv2.adaptiveThreshold(
        clahe,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        51,
        9,
    )
    variants.append((adaptive_wide, "adaptive_51", True))

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    closed = cv2.morphologyEx(otsu, cv2.MORPH_CLOSE, kernel)
    variants.append((closed, "otsu_close", True))

    height, width = gray.shape[:2]
    if max(height, width) < 1400:
        scale = 1400 / max(height, width)
        scaled = []
        for item, label, aggressive in variants[:6]:
            resized = cv2.resize(item, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            scaled.append((resized, f"{label}_upscaled", aggressive))
        variants.extend(scaled)

    return variants


def decode_results(image):
    try:
        results = zxingcpp.read_barcodes(image)
    except Exception:
        return []

    decoded = []
    for result in results or []:
        text = getattr(result, "text", "") or ""
        if not text:
            continue
        decoded.append({
            "text": text,
            "format": str(getattr(result, "format", "UNKNOWN")),
            "formatNormalized": format_name(result),
        })

    decoded.sort(key=lambda item: 0 if "PDF417" in item["formatNormalized"] else 1)
    return decoded


def register_attempt(state, image, source, variant, rotation, aggressive):
    if state["attempts"] >= MAX_DECODE_ATTEMPTS:
        state["limitReached"] = True
        return False
    if time.monotonic() >= state["deadline"]:
        state["timedOut"] = True
        return False

    state["attempts"] += 1
    for result in decode_results(image):
        validation = validate_bcbp(result["text"])
        state["records"].append({
            "text": result["text"],
            "format": result["format"],
            "source": source["source"],
            "sourceKind": source["sourceKind"],
            "transform": source["transform"],
            "variant": variant,
            "rotation": rotation,
            "aggressive": bool(aggressive),
            "bcbpValid": validation["valid"],
            "bcbpValidation": validation["reason"],
        })

    return True


def has_confident_result(records):
    if not records:
        return False

    counts = Counter(record["text"] for record in records)
    if counts.most_common(1)[0][1] >= 2:
        return True

    for record in records:
        if record["sourceKind"] == "original" and record["variant"] == "raw" and not record["aggressive"]:
            return True
        if record["bcbpValid"] and not record["aggressive"]:
            return True

    return False


def scan_source(state, source):
    for rotated, rotation in orthogonal_rotations(source["image"]):
        if not register_attempt(state, rotated, source, "raw", rotation, False):
            return
        if has_confident_result(state["records"]):
            return

    for variant, label, aggressive in preprocess_variants(source["image"]):
        for rotated, rotation in orthogonal_rotations(variant):
            if not register_attempt(state, rotated, source, label, rotation, aggressive):
                return
            if has_confident_result(state["records"]):
                return

    if source["sourceKind"] == "original":
        return

    gray = gray_image(source["image"])
    for angle in (-18, -12, -7, 7, 12, 18):
        rotated = rotate_bound(gray, angle)
        if not register_attempt(state, rotated, source, f"angle_{angle}", str(angle), True):
            return
        if has_confident_result(state["records"]):
            return


def record_score(record, consensus_count):
    score = 0
    if record["bcbpValid"]:
        score += 45
    if record["sourceKind"] == "original":
        score += 25
    elif record["sourceKind"] == "region_perspective":
        score += 22
    elif record["sourceKind"] == "region_crop":
        score += 18
    elif record["sourceKind"] == "broad_crop":
        score += 10

    if record["variant"] == "raw":
        score += 20
    elif record["variant"] in ("gray", "clahe", "sharpen"):
        score += 12
    else:
        score += 5

    if record["aggressive"]:
        score -= 8

    score += min(consensus_count, 5) * 18
    if "PDF417" in record["format"].upper().replace("_", ""):
        score += 8

    return score


def choose_best(records):
    counts = Counter(record["text"] for record in records)
    best = None
    best_score = None

    for record in records:
        score = record_score(record, counts[record["text"]])
        if best is None or score > best_score:
            best = record
            best_score = score

    consensus_count = counts[best["text"]]
    conflicting_values = len(counts)

    if consensus_count >= 2 and (best["bcbpValid"] or conflicting_values == 1):
        confidence = "high"
    elif best["bcbpValid"] and not best["aggressive"]:
        confidence = "high"
    elif best["sourceKind"] == "original" and best["variant"] == "raw":
        confidence = "high"
    elif best["bcbpValid"] or consensus_count >= 2 or not best["aggressive"]:
        confidence = "medium"
    else:
        confidence = "low"

    return best, {
        "confidence": confidence,
        "consensusCount": consensus_count,
        "conflictingResults": max(0, conflicting_values - 1),
        "score": best_score,
    }


def failure_reason(quality, candidate_count, state):
    if state.get("timedOut"):
        return "timeout"
    if quality["longestSide"] < 520:
        return "too_small"
    if quality["blurScore"] < 35:
        return "too_blurry"
    if quality["contrastScore"] < 18:
        return "low_contrast"
    if candidate_count > 0:
        return "manual_adjustment_needed"
    return "no_barcode_found"


def failure_message(reason):
    messages = {
        "timeout": "Could not decode barcode before the recovery timeout.",
        "too_small": "Could not decode barcode. The image appears too small for reliable recovery.",
        "too_blurry": "Could not decode barcode. The image appears too blurry for reliable recovery.",
        "low_contrast": "Could not decode barcode. The barcode area appears too low-contrast.",
        "manual_adjustment_needed": "Could not decode barcode automatically. A barcode-like area was found, but it likely needs a tighter crop or perspective correction.",
        "no_barcode_found": "Could not decode barcode. No readable barcode region was found.",
    }
    return messages.get(reason, "Could not decode barcode.")


def decode_image(image):
    quality = quality_metrics(image)
    deadline = time.monotonic() + MAX_INTERNAL_SECONDS
    state = {
        "attempts": 0,
        "records": [],
        "deadline": deadline,
        "timedOut": False,
        "limitReached": False,
    }

    original_source = {
        "image": image.copy(),
        "source": "original",
        "sourceKind": "original",
        "transform": "none",
    }
    scan_source(state, original_source)

    candidate_count = 0
    if not has_confident_result(state["records"]) and not state["timedOut"] and not state["limitReached"]:
        region_items, candidate_count = region_sources(image.copy())
        for source in region_items:
            scan_source(state, source)
            if has_confident_result(state["records"]) or state["timedOut"] or state["limitReached"]:
                break

    if not has_confident_result(state["records"]) and not state["timedOut"] and not state["limitReached"]:
        for source in broad_crop_sources(image.copy()):
            scan_source(state, source)
            if has_confident_result(state["records"]) or state["timedOut"] or state["limitReached"]:
                break

    diagnostics = {
        "attempts": state["attempts"],
        "candidateCount": candidate_count,
        "quality": quality,
        "timedOut": state["timedOut"],
        "limitReached": state["limitReached"],
    }

    if not state["records"]:
        reason = failure_reason(quality, candidate_count, state)
        return {
            "success": False,
            "reason": reason,
            "error": failure_message(reason),
            "diagnostics": diagnostics,
        }

    best, confidence_info = choose_best(state["records"])
    raw = best["text"]
    parsed = parse_bcbp(raw)
    diagnostics.update({
        "consensusCount": confidence_info["consensusCount"],
        "conflictingResults": confidence_info["conflictingResults"],
    })

    return {
        "success": True,
        "barcodeType": best["format"],
        "raw": raw,
        "parsed": parsed,
        "confidence": confidence_info["confidence"],
        "decodeInfo": {
            "source": best["source"],
            "sourceKind": best["sourceKind"],
            "transform": best["transform"],
            "variant": best["variant"],
            "rotation": best["rotation"],
            "aggressiveProcessingUsed": best["aggressive"],
            "bcbpValid": best["bcbpValid"],
            "bcbpValidation": best["bcbpValidation"],
            "consensusCount": confidence_info["consensusCount"],
            "conflictingResults": confidence_info["conflictingResults"],
        },
        "diagnostics": diagnostics,
    }


def main():
    if len(sys.argv) < 2:
        json_exit({"success": False, "error": "No image path provided"}, 1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        json_exit({"success": False, "error": f"File not found: {image_path}"}, 1)

    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        json_exit({"success": False, "error": "Could not read image file"}, 1)

    json_exit(decode_image(image))


if __name__ == "__main__":
    main()
