import sys
import os

# Enforce single-thread execution for low-memory container environments
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["ONNXRUNTIME_INTR_OP_NUM_THREADS"] = "1"

import onnxruntime as ort
_orig_SessionOptions = ort.SessionOptions
def low_mem_session_options(*args, **kwargs):
    opt = _orig_SessionOptions(*args, **kwargs)
    opt.intra_op_num_threads = 1
    opt.inter_op_num_threads = 1
    opt.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    opt.enable_cpu_mem_arena = False
    return opt
ort.SessionOptions = low_mem_session_options

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
            ocr.text_detector.limit_side_len = 736
            ocr.text_detector.limit_type = 'max'
            if hasattr(ocr.text_detector, 'postprocess_op'):
                ocr.text_detector.postprocess_op.unclip_ratio = 1.9
                ocr.text_detector.postprocess_op.box_thresh = 0.45
        parser = PackagingLayoutParser()

        enhanced_rgb, scale = ImagePreprocessor.preprocess_for_ocr(img_np)
        result, elapse = ocr(enhanced_rgb)
        raw_boxes = []

        if result:
            for item in result:
                box_coords = [
                    [round(float(p[0]) / scale, 2), round(float(p[1]) / scale, 2)]
                    for p in item[0]
                ]
                text = str(item[1]).strip()
                conf = float(item[2])
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

