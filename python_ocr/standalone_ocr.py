import sys
import os

import json
import gc
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
from layout_parser import PackagingLayoutParser

def run_standalone(image_path):
    if not os.path.exists(image_path):
        print(json.dumps({'success': False, 'error': f'Image file not found: {image_path}'}))
        sys.exit(1)

    try:
        img_pil = Image.open(image_path)
        width, height = img_pil.size
        img_np = np.array(img_pil.convert('RGB'))

        from image_preprocessor import ImagePreprocessor

        ocr = RapidOCR(text_score=0.35, use_angle_cls=False)
        if hasattr(ocr, 'text_detector'):
            if hasattr(ocr.text_detector, 'preprocess_op') and len(ocr.text_detector.preprocess_op) > 0:
                ocr.text_detector.preprocess_op[0].limit_side_len = 640
                ocr.text_detector.preprocess_op[0].limit_type = 'max'
            if hasattr(ocr.text_detector, 'postprocess_op'):
                ocr.text_detector.postprocess_op.unclip_ratio = 1.9
                ocr.text_detector.postprocess_op.box_thresh = 0.40
                ocr.text_detector.postprocess_op.max_candidates = 800
        parser = PackagingLayoutParser()

        enhanced_rgb, scale = ImagePreprocessor.preprocess_for_ocr(img_np)
        ocr_result, _ = ocr(enhanced_rgb)
        del enhanced_rgb

        raw_boxes = []
        items = []
        if isinstance(ocr_result, (list, tuple)):
            for it in ocr_result:
                if isinstance(it, (list, tuple)) and len(it) >= 3:
                    items.append((it[0], it[1], it[2]))
        elif hasattr(ocr_result, 'boxes') and hasattr(ocr_result, 'txts') and hasattr(ocr_result, 'scores'):
            boxes = ocr_result.boxes or []
            txts = ocr_result.txts or []
            scores = ocr_result.scores or []
            for b, t, s in zip(boxes, txts, scores):
                items.append((b, t, s))

        for box_pts, text_val, conf_val in items:
            box_coords = [
                [round(float(p[0]) / scale, 2), round(float(p[1]) / scale, 2)]
                for p in box_pts
            ]
            text = str(text_val).strip()
            try:
                conf = float(conf_val)
            except (ValueError, TypeError):
                conf = 0.85
            if text:
                raw_boxes.append({
                    'box': box_coords,
                    'text': text,
                    'confidence': conf
                })

        structured, full_text = parser.parse(raw_boxes, image_width=width, image_height=height)

        output = {
            'success': True,
            'image_dims': {'width': width, 'height': height},
            'raw_text': full_text,
            'boxes': raw_boxes,
            'structured': structured,
            'total_detections': len(raw_boxes)
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'Usage: python standalone_ocr.py <image_path>'}))
        sys.exit(1)
    run_standalone(sys.argv[1])

