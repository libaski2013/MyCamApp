"""Small, stateful LivePortrait HTTP worker for one persistent GPU Pod."""
import asyncio
import os
import secrets
import time
from io import BytesIO

import cv2
import numpy as np
import torch
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import Response
from PIL import Image

from src.config.inference_config import InferenceConfig
from src.live_portrait_wrapper import LivePortraitWrapper
from src.utils.camera import get_rotation_matrix

TOKEN = os.environ.get("WORKER_TOKEN", "")
if len(TOKEN) < 32:
    raise RuntimeError("WORKER_TOKEN must be at least 32 characters")
if not torch.cuda.is_available():
    raise RuntimeError("A CUDA GPU is required")

app = FastAPI(docs_url=None, redoc_url=None)
wrapper = LivePortraitWrapper(InferenceConfig())
sessions = {}
gpu_lock = asyncio.Lock()
MAX_BYTES = 8 * 1024 * 1024


def authenticate(value):
    if not secrets.compare_digest(value or "", "Bearer " + TOKEN):
        raise HTTPException(401, "Unauthorized")


def decode_image(data):
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
        with Image.open(BytesIO(data)) as image:
            rgb = np.asarray(image.convert("RGB"))
        if min(rgb.shape[:2]) < 128 or max(rgb.shape[:2]) > 4096:
            raise ValueError("Image dimensions outside supported range")
        return rgb
    except Exception as exc:
        raise HTTPException(400, "Invalid image") from exc


async def image_body(request):
    if request.headers.get("content-length") and int(request.headers["content-length"]) > MAX_BYTES:
        raise HTTPException(413, "Image too large")
    data = await request.body()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large")
    return decode_image(data)


@app.get("/health")
def health(authorization: str = Header(default="")):
    authenticate(authorization)
    return {"ok": True, "engine": "LivePortrait", "gpu": torch.cuda.get_device_name(0)}


@app.post("/sessions")
async def create_session(request: Request, authorization: str = Header(default="")):
    authenticate(authorization)
    source = await image_body(request)
    async with gpu_lock:
        now = time.monotonic()
        for key in list(sessions):
            if now - sessions[key]["last"] > 300:
                del sessions[key]
        if len(sessions) >= 8:
            raise HTTPException(429, "Too many portrait sessions")
        # The browser already cropped a detected face with MediaPipe. No InsightFace models are used.
        prepared = wrapper.prepare_source(cv2.resize(source, (256, 256)))
        info = wrapper.get_kp_info(prepared)
        session_id = secrets.token_urlsafe(24)
        sessions[session_id] = {
            "source": info,
            "rotation": get_rotation_matrix(info["pitch"], info["yaw"], info["roll"]),
            "feature": wrapper.extract_feature_3d(prepared),
            "keypoints": wrapper.transform_keypoint(info),
            "first": None,
            "last": now,
        }
    return {"sessionId": session_id}


@app.post("/sessions/{session_id}/frame")
async def render_frame(session_id: str, request: Request, authorization: str = Header(default="")):
    authenticate(authorization)
    driving = await image_body(request)
    async with gpu_lock:
        session = sessions.get(session_id)
        if session is None or time.monotonic() - session["last"] > 300:
            sessions.pop(session_id, None)
            raise HTTPException(404, "Portrait session expired")
        session["last"] = time.monotonic()
        frame = cv2.resize(driving, (256, 256))
        info = wrapper.get_kp_info(wrapper.prepare_source(frame))
        rotation = get_rotation_matrix(info["pitch"], info["yaw"], info["roll"])
        if session["first"] is None:
            session["first"] = {key: value.clone() for key, value in info.items()}
            session["first_rotation"] = rotation.clone()
        first = session["first"]
        source = session["source"]
        new_rotation = (rotation @ session["first_rotation"].permute(0, 2, 1)) @ session["rotation"]
        expression = source["exp"] + (info["exp"] - first["exp"])
        scale = source["scale"] * (info["scale"] / first["scale"])
        translation = source["t"] + (info["t"] - first["t"])
        translation[..., 2].fill_(0)
        keypoints = scale * (source["kp"] @ new_rotation + expression) + translation
        keypoints = wrapper.stitching(session["keypoints"], keypoints)
        output = wrapper.warp_decode(session["feature"], session["keypoints"], keypoints)
        rendered = wrapper.parse_output(output["out"])[0]
        buffer = BytesIO()
        Image.fromarray(rendered).save(buffer, format="JPEG", quality=85)
        return Response(buffer.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, authorization: str = Header(default="")):
    authenticate(authorization)
    async with gpu_lock:
        sessions.pop(session_id, None)
    return {"ok": True}
