#!/usr/bin/env python3
"""
Quick test script to verify Ollama connectivity from the backend.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.services.llm import call_llm

def test_llm():
    try:
        response = call_llm(
            prompt="Hello, can you confirm you're working?",
            system="You are a test assistant.",
            temperature=0.1,
            max_tokens=50
        )
        print("✅ Ollama connection successful!")
        print(f"Response: {response}")
    except Exception as e:
        print(f"❌ Ollama connection failed: {e}")

if __name__ == "__main__":
    test_llm()