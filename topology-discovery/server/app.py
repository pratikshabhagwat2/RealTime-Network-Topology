from flask import Flask, send_from_directory
import os

# Paths based on your actual project structure
STATIC_DATA_DIR = "/app/static"  # inside container path via Docker volume

app = Flask(__name__)

@app.route("/")
def health():
    return {"status": "Server running", "topology_json": f"/static/topology.json"}

@app.route("/static/<path:filename>")
def serve_topology_file(filename):
    return send_from_directory(STATIC_DATA_DIR, filename)

if __name__ == "__main__":
    print(f"📊 Serving topology JSON from: {STATIC_DATA_DIR}")
    app.run(host="0.0.0.0", port=5002, debug=True)

