import cv2
import numpy as np
import gc
import sys
import re

class ImagePreprocessor:
    """
    Advanced Image Enhancement & Auto-Orientation Pipeline for Packaging OCR.
    Handles real-world smartphone photos:
    - Automatically detects product orientation (handles bottles/pouches lying sideways at 90° or 270°)
    - Scales to high-clarity 1100px resolution preserving fine-print declarations (MRP, USP, PIN codes)
    - Applies CLAHE contrast enhancement and unsharp masking to overcome foil glare and curved surface shadows
    """

    RE_ORIENTATION_KW = re.compile(
        r'(?:net|wt|qty|mrp|rs|₹|mfg|date|batch|exp|care|tel|call|marketed|mfd|packed|pvt|ltd|india|flour|talc|powder|grams?|kg|ml|g\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)',
        re.I
    )

    @staticmethod
    def detect_and_align_orientation(bgr_img, ocr_engine=None):
        """
        Detects if the packaging image is rotated sideways (e.g. 90° CW or 90° CCW / 270°).
        Evaluates orientations on a fast 320px thumbnail.
        Returns:
            aligned_bgr (numpy.ndarray): Upright image rotated to natural horizontal reading angle
            applied_deg (int): 0, 90, 180, or 270
        """
        if ocr_engine is None:
            return bgr_img, 0

        h, w = bgr_img.shape[:2]
        thumb_scale = 320.0 / max(h, w)
        thumb = cv2.resize(bgr_img, (int(w * thumb_scale), int(h * thumb_scale)), interpolation=cv2.INTER_AREA)

        candidates = [
            (0, None, thumb),
            (90, cv2.ROTATE_90_CLOCKWISE, cv2.rotate(thumb, cv2.ROTATE_90_CLOCKWISE)),
            (270, cv2.ROTATE_90_COUNTERCLOCKWISE, cv2.rotate(thumb, cv2.ROTATE_90_COUNTERCLOCKWISE)),
            (180, cv2.ROTATE_180, cv2.rotate(thumb, cv2.ROTATE_180))
        ]

        best_deg = 0
        best_rot_code = None
        best_score = -1

        for deg, rot_code, cand_img in candidates:
            try:
                res, _ = ocr_engine(cand_img)
            except Exception:
                res = None

            if not res:
                score = 0
            else:
                texts = [r[1] for r in res]
                full_str = " ".join(texts)
                kw_count = len(ImagePreprocessor.RE_ORIENTATION_KW.findall(full_str))
                box_count = len(res)
                # Count boxes where width >= height (natural horizontal line geometry)
                h_boxes = 0
                for r in res:
                    pts = r[0]
                    bw = max(p[0] for p in pts) - min(p[0] for p in pts)
                    bh = max(p[1] for p in pts) - min(p[1] for p in pts)
                    if bw >= bh * 1.1:
                        h_boxes += 1
                # Weight: packaging keywords (10x), horizontal text geometry (2x), total box count (1x)
                score = (kw_count * 10.0) + (h_boxes * 2.0) + (box_count * 1.0)

            if score > best_score:
                best_score = score
                best_deg = deg
                best_rot_code = rot_code

        # If an orientation other than 0° scores higher, rotate the full-resolution image!
        if best_deg != 0 and best_rot_code is not None:
            print(f"[Python-OCR Orientation] Detected sideways packaging! Rotating {best_deg}° to upright (score={best_score:.1f})", file=sys.stderr, flush=True)
            aligned_bgr = cv2.rotate(bgr_img, best_rot_code)
            return aligned_bgr, best_deg

        return bgr_img, 0

    @staticmethod
    def preprocess_for_ocr(bgr_img):
        """
        Prepares the input packaging image for maximum OCR detection and recognition accuracy.
        - Automatically caps ultra-high-resolution smartphone photos (>1200px) down to 1200px max dimension,
          conserving RAM while preserving high typographical clarity.
        - Retains clean native color channels without artificial blurring, CLAHE, or unsharp masks
          which distort DBNet edge detection features.
        Returns:
            processed_bgr (numpy.ndarray): Preprocessed image ready for OCR engine
            scale (float): Scale factor applied during preprocessing
        """
        h, w = bgr_img.shape[:2]
        max_dim = float(max(h, w))
        scale = 1.0

        if max_dim > 1200.0:
            scale = 1200.0 / max_dim
            new_w = int(round(w * scale))
            new_h = int(round(h * scale))
            bgr = cv2.resize(bgr_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            return bgr, scale

        return bgr_img, 1.0


