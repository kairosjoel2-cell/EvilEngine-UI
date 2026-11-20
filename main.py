from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="EvilEngine FullStack", version="1.0.0")

class PromptRequest(BaseModel):
    prompt: str

@app.post("/api/generate")
def generate(payload: PromptRequest):
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")
    return {"response": f"[EVILGPT] Demo response: '{prompt}'. This is a local-style demo, not a connected AI model."}

app.mount("/", StaticFiles(directory="static", html=True), name="static")
