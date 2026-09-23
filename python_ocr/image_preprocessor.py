import cv2
import numpy as np

class ImagePreprocessor:
    """
    Advanced Image Enhancement Pipeline for Packaging OCR.
    Handles packaging challenges:
    - Stylized, condensed, or dot-matrix fonts
    - Low-resolution fine print (1mm-2mm declaration font heights)
    - Low-contrast colored backgrounds (e.g., colored foil, pouches)
    - Glare and uneven illumination
    """

    @staticmethod
    def preprocess_for_ocr(img_np):
        """
        Enhances the input image for maximum text detection and recognition accuracy.
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

        # 1. Intelligent Scale-Up for Fine Print & Varied Fonts
        # Declarations under Rule 7 can be small numerals (e.g. 1mm-3mm).
        # Upscaling ensures character strokes are >= 32px high for the recognition CNN.
        scale = 1.0
        target_min_dim = 1200.0
        max_dim = max(h, w)
        if max_dim < target_min_dim:
            scale = target_min_dim / float(max_dim)
            new_w = int(round(w * scale))
            new_h = int(round(h * scale))
            # Use Lanczos / Cubic interpolation to keep text edges crisp without pixelation
            bgr = cv2.resize(bgr, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        # 2. Local Luminance Contrast Enhancement via CLAHE in LAB Color Space
        # This brings out faint, colored, or low-contrast fonts from background packaging
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)

        # Contrast Limited Adaptive Histogram Equalization on L-channel
        clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)

        enhanced_lab = cv2.merge((l_clahe, a, b))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

        # 3. Gentle Unsharp Masking for Sharp Character Boundaries
        # Enhances thin strokes in stylized fonts, dot-matrix dots, and condensed letters
        gaussian = cv2.GaussianBlur(enhanced_bgr, (0, 0), sigmaX=2.0)
        sharpened_bgr = cv2.addWeighted(enhanced_bgr, 1.35, gaussian, -0.35, 0)

        # Convert back to RGB for RapidOCR / PaddleOCR
        final_rgb = cv2.cvtColor(sharpened_bgr, cv2.COLOR_BGR2RGB)

        return final_rgb, scale

