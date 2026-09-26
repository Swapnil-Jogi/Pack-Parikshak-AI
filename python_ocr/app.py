import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import base64
import io
import gc
import cv2
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from rapidocr_onnxruntime import RapidOCR
from layout_parser import PackagingLayoutParser
from image_preprocessor import ImagePreprocessor

import time

app = Flask(__name__)
CORS(app)

print("[Python-OCR] Initializing PaddleOCR / RapidOCR ONNX Engine with low-memory single-thread settings...", flush=True)
try:
    # Optimized parameters for low-memory container environments (512MB RAM ceiling)
    # Disabling angle classifier saves ~60MB RAM by preventing cls ONNX model loading
    ocr_engine = RapidOCR(
        text_score=0.22,
        use_angle_cls=False
    )
    # Tune detector parameters for packaging labels & cap max side length to 960px
    if hasattr(ocr_engine, 'text_detector'):
        if hasattr(ocr_engine.text_detector, 'preprocess_op') and len(ocr_engine.text_detector.preprocess_op) > 0:
            ocr_engine.text_detector.preprocess_op[0].limit_side_len = 960
            ocr_engine.text_detector.preprocess_op[0].limit_type = 'max'
        if hasattr(ocr_engine.text_detector, 'postprocess_op'):
            ocr_engine.text_detector.postprocess_op.unclip_ratio = 2.0
            ocr_engine.text_detector.postprocess_op.box_thresh = 0.35
            ocr_engine.text_detector.postprocess_op.max_candidates = 1000
    layout_parser = PackagingLayoutParser()
    print("[Python-OCR] High-precision low-memory PaddleOCR Engine initialized and ready (960px profile + auto-orient).", flush=True)

    # Pre-warm detector and recognizer ONNX graphs with a tiny text image
    try:
        from PIL import ImageDraw
        warmup_pil = Image.new('RGB', (100, 36), color=(255, 255, 255))
        d = ImageDraw.Draw(warmup_pil)
        d.text((5, 5), "LM 2011", fill=(0, 0, 0))
        ocr_engine(np.array(warmup_pil))
        del warmup_pil, d
        gc.collect()
        print("[Python-OCR] ONNX runtime execution graphs warmed up and ready for instant inference.", flush=True)
    except Exception as warm_err:
        print(f"[Python-OCR] Warmup notice: {warm_err}", file=sys.stderr, flush=True)
except Exception as e:
    print(f"[Python-OCR] Error initializing OCR engine: {e}", file=sys.stderr, flush=True)
    ocr_engine = None
    layout_parser = None

def process_image(img_pil, image_path=None):
    orig_w, orig_h = img_pil.size
    print(f"[Python-OCR Process] Starting processing for image: {orig_w}x{orig_h}", flush=True)
    img_bgr = cv2.cvtColor(np.array(img_pil.convert('RGB')), cv2.COLOR_RGB2BGR)

    if ocr_engine is None:
        raise RuntimeError("OCR Engine is not initialized")

    try:
        # 1. Smart Auto-Orientation: detect sideways packaging and rotate upright
        aligned_bgr, rot_deg = ImagePreprocessor.detect_and_align_orientation(img_bgr, ocr_engine)
        if rot_deg != 0 and image_path and os.path.exists(image_path):
            try:
                cv2.imwrite(image_path, aligned_bgr)
                print(f"[Python-OCR Process] Packaging rotated {rot_deg}° and saved upright to {image_path}", flush=True)
            except Exception as save_err:
                print(f"[Python-OCR Process] Note: failed to overwrite upright image: {save_err}", flush=True)

        upright_h, upright_w = aligned_bgr.shape[:2]

        # 2. Advanced Preprocessing: memory-safe scaling for large images
        print("[Python-OCR Process] Preprocessing image...", flush=True)
        processed_bgr, scale = ImagePreprocessor.preprocess_for_ocr(aligned_bgr)
        del aligned_bgr, img_bgr
        print(f"[Python-OCR Process] Preprocessing complete: shape={processed_bgr.shape}, scale={scale:.3f}", flush=True)

        # 3. Text Inference via Universal Callable
        t0 = time.time()
        print("[Python-OCR Process] Running OCR engine inference...", flush=True)
        ocr_result, elapse = ocr_engine(processed_bgr)
        del processed_bgr
        elapse_str = f"{elapse:.2f}s" if isinstance(elapse, (int, float)) else str(elapse)
        print(f"[Python-OCR Process] OCR inference finished in {elapse_str}", flush=True)

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

        # 4. Spatial & semantic layout parsing using font-tolerant heuristics
        print(f"[Python-OCR Process] Running layout parser on {len(raw_boxes)} boxes...", flush=True)
        structured, full_text = layout_parser.parse(raw_boxes, image_width=upright_w, image_height=upright_h)
        print(f"[Python-OCR Process] Structured parsing complete in {time.time() - t0:.2f}s!", flush=True)

        return {
            'success': True,
            'image_dims': {'width': upright_w, 'height': upright_h},
            'raw_text': full_text,
            'boxes': raw_boxes,
            'structured': structured,
            'total_detections': len(raw_boxes)
        }
    except Exception as proc_err:
        print(f"[Python-OCR Process Error] Failed: {proc_err}", file=sys.stderr, flush=True)
        raise proc_err
    finally:
        gc.collect()

@app.route('/', methods=['GET', 'HEAD'])
def root():
    return jsonify({
        'status': 'healthy',
        'service': 'Pack-Parikshak PaddleOCR Microservice',
        'version': '1.0.0',
        'engine': 'PaddleOCR (RapidOCR PP-OCRv4 ONNX)',
        'endpoints': {
            'health': '/health',
            'ocr': '/api/ocr'
        }
    })

@app.route('/health', methods=['GET', 'HEAD'])
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'Pack-Parikshak PaddleOCR Microservice',
        'version': '1.0.0',
        'engine': 'PaddleOCR (RapidOCR PP-OCRv4 ONNX)'
    })

@app.route('/api/ocr', methods=['POST'])
def run_ocr():
    try:
        img_pil = None
        print(f"[Python-OCR Request] Received OCR request. Content-Type: {request.content_type}", flush=True)

        # Check for uploaded file
        if 'image' in request.files:
            file = request.files['image']
            img_pil = Image.open(file.stream)
            print(f"[Python-OCR Request] Read file from request.files['image']", flush=True)
        elif 'file' in request.files:
            file = request.files['file']
            img_pil = Image.open(file.stream)
            print(f"[Python-OCR Request] Read file from request.files['file']", flush=True)
        # Check for JSON payload
        elif request.is_json:
            data = request.get_json()
            if 'image_path' in data:
                img_path = data['image_path']
                print(f"[Python-OCR Request] Image path requested: {img_path} (exists={os.path.exists(img_path)})", flush=True)
                if os.path.exists(img_path):
                    img_pil = Image.open(img_path)
            elif 'base64_image' in data:
                b64_data = data['base64_image']
                if ',' in b64_data:
                    b64_data = b64_data.split(',')[1]
                img_bytes = base64.b64decode(b64_data)
                img_pil = Image.open(io.BytesIO(img_bytes))

        target_img_path = None
        if request.is_json and data and 'image_path' in data:
            target_img_path = data['image_path']

        res = process_image(img_pil, image_path=target_img_path)
        return jsonify(res)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', os.environ.get('PYTHON_OCR_PORT', 5000)))
    host = os.environ.get('PYTHON_OCR_HOST', '127.0.0.1')
    try:
        from waitress import serve
        print(f"[Python-OCR] Starting Production WSGI Server (Waitress) on {host}:{port}...", flush=True)
        serve(app, host=host, port=port, threads=2)
    except ImportError:
        print(f"[Python-OCR] Starting Flask OCR Microservice on {host}:{port}...", flush=True)
        app.run(host=host, port=port, debug=False, threaded=True)

