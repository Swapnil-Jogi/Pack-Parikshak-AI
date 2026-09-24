import cv2
import numpy as np
import gc

class ImagePreprocessor:
    """
    Advanced Image Enhancement Pipeline for Packaging OCR.
    Optimized for high-accuracy text detection under cloud memory constraints (512MB RAM).
    """

    @staticmethod
    def preprocess_for_ocr(img_np):
        """
        Enhances the input image for maximum text detection and recognition accuracy
        while strictly controlling peak memory consumption.
        Returns:
            enhanced_np (numpy.ndarray): Preprocessed RGB image ready for OCR engine
            scale (float): Scale factor applied during preprocessing (used to remap coordinates)
        """
        # Ensure BGR format for OpenCV
        if len(img_np.shape) == 2:
            bgr = cv2.cvtColor(img_np, cv2.COLOR_GRAY2BGR)
        elif img_np.shape[2] == 4:
            bgr = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
        else:
            bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

        h, w = bgr.shape[:2]
        max_dim = float(max(h, w))
        scale = 1.0

        # Memory safeguard:
        # Scale down large images (> 640px) to strictly maintain low memory profile on 512MB containers.
        # RapidOCR's internal DBNet operates with high precision at 512-640px.
        # Only upscale very tiny images (< 360px) to conserve RAM.
        if max_dim > 640.0:
            scale = 640.0 / max_dim
            new_w = int(round(w * scale))
            new_h = int(round(h * scale))
            bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
        elif max_dim < 360.0:
            scale = 360.0 / max_dim
            new_w = int(round(w * scale))
            new_h = int(round(h * scale))
            bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # 2. Local Luminance Contrast Enhancement via CLAHE in LAB Color Space
        # Brings out faint, colored, or low-contrast packaging declarations
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        l, a, b_chan = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)

        enhanced_lab = cv2.merge((l_clahe, a, b_chan))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        del lab, l, a, b_chan, l_clahe, enhanced_lab

        # 3. Gentle Unsharp Masking for Sharp Character Boundaries
        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=1.8)
        sharpened_bgr = cv2.addWeighted(enhanced_bgr, 1.3, gaussian, -0.3, 0)
        del enhanced_bgr, gaussian

        # Convert back to RGB for RapidOCR / PaddleOCR
        final_rgb = cv2.cvtColor(sharpened_bgr, cv2.COLOR_BGR2RGB)
        del sharpened_bgr

        return final_rgb, scale


