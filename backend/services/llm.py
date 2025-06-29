# services/llm.py
import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Load your API key

def call_llm(prompt: str, system: str = "You are a helpful genomics assistant.", 
             model: str = "gpt-4o-mini", temperature: float = 0.2, max_tokens: int = 300) -> str:
    """
    Sends `prompt` to the LLM and returns the generated text.
    - `system` sets the system message (context/role of the assistant).
    - `model`, `temperature`, and `max_tokens` are tunable.
    """
    response = client.chat.completions.create(model=model,
    messages=[
        {"role": "system", "content": system},
        {"role": "user",   "content": prompt}
    ],
    temperature=temperature,
    max_tokens=max_tokens)
    # Extract and return the assistant’s reply
    return response.choices[0].message.content.strip()
