FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/LivePortrait
RUN git clone https://github.com/KlingAIResearch/LivePortrait.git . && git checkout 9b294b3d0536135442ea73cb01e6cb3ca7029dd3 && pip install --no-cache-dir -r requirements.txt fastapi==0.115.12 uvicorn==0.34.0 pillow huggingface_hub[cli]==0.25.2
COPY main.py /opt/LivePortrait/worker_main.py
EXPOSE 8000
CMD ["bash", "-lc", "huggingface-cli download KlingTeam/LivePortrait --local-dir pretrained_weights --include 'liveportrait/base_models/*' 'liveportrait/retargeting_models/*' && exec uvicorn worker_main:app --host 0.0.0.0 --port 8000 --workers 1"]
