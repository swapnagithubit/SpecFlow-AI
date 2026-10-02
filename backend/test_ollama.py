import requests

r = requests.post(
    "http://localhost:11434/api/generate",
    json={
        "model": "llama3.1",
        "prompt": "Write 3 test cases for a login page.",
        "stream": False,
    },
    timeout=300,
)
print(r.json()["response"])