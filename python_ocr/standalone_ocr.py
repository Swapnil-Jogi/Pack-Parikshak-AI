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
                ocr.text_detector.preprocess_op[0].limit_side_len = 420
                ocr.text_detector.preprocess_op[0].limit_type = 'max'
            if hasattr(ocr.text_detector, 'postprocess_op'):
                ocr.text_detector.postprocess_op.unclip_ratio = 1.9
                ocr.text_detector.postprocess_op.box_thresh = 0.45
                ocr.text_detector.postprocess_op.max_candidates = 500
        parser = PackagingLayoutParser()

        enhanced_rgb, scale = ImagePreprocessor.preprocess_for_ocr(img_np)
        dt_boxes, _ = ocr.text_detector(enhanced_rgb)
        raw_boxes = []

        if dt_boxes is not None and len(dt_boxes) > 0:
            dt_boxes = ocr.sorted_boxes(dt_boxes)
            if len(dt_boxes) > 35:
                dt_boxes = dt_boxes[:35]
            img_crop_list = ocr.get_crop_img_list(enhanced_rgb, dt_boxes)
            del enhanced_rgb

            rec_res, _ = ocr.text_recognizer(img_crop_list)
            filter_boxes, filter_rec_res = ocr.filter_boxes_rec_by_score(dt_boxes, rec_res)
            for dt, rec in zip(filter_boxes, filter_rec_res):
                box_coords = [
                    [round(float(p[0]) / scale, 2), round(float(p[1]) / scale, 2)]
                    for p in dt
                ]
                text = str(rec[0]).strip()
                conf = float(rec[1])
                if text:
                    raw_boxes.append({
                        'box': box_coords,
                        'text': text,
                        'confidence': conf
                    })
        else:
            del enhanced_rgb

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

