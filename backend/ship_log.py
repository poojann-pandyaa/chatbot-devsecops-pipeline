import requests, datetime

def ship_to_elk(log: dict):
    try:
        log["@timestamp"] = datetime.datetime.utcnow().isoformat()
        r = requests.post("http://localhost:5045", json=log, timeout=2)
        print("[ELK] shipped:", r.status_code, r.text)
    except Exception as e:
        print("[ELK] FAILED:", e)
