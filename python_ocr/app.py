import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json
import base64
import io
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from rapidocr_onnxruntime import RapidOCR
from layout_parser import PackagingLayoutParser
from image_preprocessor import ImagePreprocessor

app = Flask(__name__)
CORS(app)

print("[Python-OCR] Initializing PaddleOCR / RapidOCR ONNX Engine with enhanced multi-font settings...", flush=True)
try:
    # Tuned parameters for diverse packaging fonts (condensed, script, dot-matrix, thin strokes)
    ocr_engine = RapidOCR(
        text_score=0.35,      # Lower score threshold ensures stylized fonts aren't discarded
        use_angle_cls=True    # Rotate sideways/angled text automatically
    )
    # Tune detector postprocessing parameters for packaging labels
    if hasattr(ocr_engine, 'text_detector') and hasattr(ocr_engine.text_detector, 'postprocess_op'):
        ocr_engine.text_detector.postprocess_op.unclip_ratio = 1.9  # Expand polygon to avoid clipping ascenders/descenders
        ocr_engine.text_detector.postprocess_op.box_thresh = 0.45   # Catch faint or thin-font text lines
    layout_parser = PackagingLayoutParser()
    print("[Python-OCR] Enhanced PaddleOCR Engine initialized and ready.", flush=True)
except Exception as e:
    print(f"[Python-OCR] Error initializing OCR engine: {e}", file=sys.stderr, flush=True)
    ocr_engine = None
    layout_parser = None

def process_image(img_pil):
    orig_w, orig_h = img_pil.size
    img_np = np.array(img_pil.convert('RGB'))

    if ocr_engine is None:
        raise RuntimeError("OCR Engine is not initialized")

    # 1. Advanced Preprocessing: CLAHE contrast, Lanczos scale-up for fine-print, unsharp masking
    enhanced_rgb, scale = ImagePreprocessor.preprocess_for_ocr(img_np)

    # 2. Run OCR on enhanced image
    result, elapse = ocr_engine(enhanced_rgb)
    raw_boxes = []

    if result:
        for item in result:
            # item[0]: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
            # Rescale coordinates back to original image dimensions for accurate canvas rendering
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

    # 3. Spatial & semantic layout parsing using font-tolerant heuristics
    structured, full_text = layout_parser.parse(raw_boxes, image_width=orig_w, image_height=orig_h)

    return {
        'success': True,
        'image_dims': {'width': orig_w, 'height': orig_h},
        'raw_text': full_text,
        'boxes': raw_boxes,
        'structured': structured,
        'total_detections': len(raw_boxes)
    }

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

        # Check for uploaded file
        if 'image' in request.files:
            file = request.files['image']
            img_pil = Image.open(file.stream)
        elif 'file' in request.files:
            file = request.files['file']
            img_pil = Image.open(file.stream)
        # Check for JSON payload
        elif request.is_json:
            data = request.get_json()
            if 'image_path' in data and os.path.exists(data['image_path']):
                img_pil = Image.open(data['image_path'])
            elif 'base64_image' in data:
                b64_data = data['base64_image']
                if ',' in b64_data:
                    b64_data = b64_data.split(',')[1]
                img_bytes = base64.b64decode(b64_data)
                img_pil = Image.open(io.BytesIO(img_bytes))

        if img_pil is None:
            return jsonify({'success': False, 'error': 'No image provided. Upload a file or provide image_path/base64_image.'}), 400

        res = process_image(img_pil)
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
        serve(app, host=host, port=port, threads=4)
    except ImportError:
        print(f"[Python-OCR] Starting Flask OCR Microservice on {host}:{port}...", flush=True)
        app.run(host=host, port=port, debug=False, threaded=True)

