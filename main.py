import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="EvilEngine FullStack", version="1.1.0")

GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


class PromptRequest(BaseModel):
    prompt: str


@app.post("/api/generate")
def generate(payload: PromptRequest):
    prompt = payload.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please enter a prompt.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="The AI service is not configured. Add GEMINI_API_KEY in Vercel.",
        )

    body = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }).encode("utf-8")

    request = Request(
        GEMINI_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=55) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        # Keep provider details and credentials out of the public response.
        if error.code == 429:
            raise HTTPException(
                status_code=429,
                detail="Gemini is busy or the API quota has been reached. Try again shortly.",
            )
        if error.code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="Gemini rejected the API key. Check the key and its API restrictions.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed (HTTP {error.code}). Please try again.",
        )
    except (URLError, TimeoutError):
        raise HTTPException(
            status_code=504,
            detail="Gemini took too long to respond. Please try again.",
        )
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an unexpected response. Please try again.",
        )

    try:
        text = "".join(
            part.get("text", "")
            for part in result["candidates"][0]["content"]["parts"]
        ).strip()
    except (KeyError, IndexError, TypeError):
        text = ""

    if not text:
        raise HTTPException(
            status_code=502,
            detail="Gemini did not return a text response. Try a different prompt.",
        )

    return {"response": text}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
