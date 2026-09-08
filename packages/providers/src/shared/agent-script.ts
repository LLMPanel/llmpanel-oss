// In-pod agent for RunPod deployments.
//
// RunPod's API only exposes GPU utilization % and memory % — no temperature,
// power, or clocks, and VRAM has to be estimated from the GPU type. It also
// has NO API for container logs at all (console-only). This tiny stdlib-only
// Python HTTP server runs inside the pod (injected by the deploy entrypoint
// wrapper in runpod.provider.ts) and serves two things on a proxied port:
//   /metrics — nvidia-smi readings (same 19 fields as the local provider)
//   /logs    — the engine's stdout/stderr, captured to a file by the
//              entrypoint wrapper via tee; supports ?tail=N (last N lines)
//              and ?offset=B (bytes from B to EOF, for follow/streaming)
// Auth is a per-deployment token passed via env.
//
// Kept as a TS constant (not a .py file on disk) so it survives bundling.
export const METRICS_AGENT_PORT = 8425
export const ENGINE_LOG_FILE = "/llmpanel-engine.log"

export const METRICS_AGENT_PY = `
import http.server
import json
import os
import subprocess
import urllib.parse

TOKEN = os.environ.get("LLMPANEL_METRICS_TOKEN", "")
PORT = int(os.environ.get("LLMPANEL_AGENT_PORT", "8425"))
LOG_FILE = os.environ.get("LLMPANEL_LOG_FILE", "/llmpanel-engine.log")
# Caps keep responses proxy-friendly: tail scans at most the trailing 2 MiB,
# follow-mode returns at most 1 MiB per request (client re-polls for the rest).
TAIL_WINDOW = 2 * 1024 * 1024
MAX_CHUNK = 1024 * 1024

# Field order mirrors local.provider.ts — response keys must match
# SingleGPUMetricsSchema exactly.
FIELDS = ",".join([
    "index", "name", "uuid",
    "utilization.gpu", "utilization.memory",
    "memory.used", "memory.total", "memory.free",
    "temperature.gpu", "temperature.memory",
    "fan.speed",
    "power.draw", "power.limit",
    "clocks.current.graphics", "clocks.current.memory", "clocks.current.sm",
    "pcie.link.gen.current", "pcie.link.width.current",
    "ecc.errors.corrected.volatile.total",
])


def num(v):
    try:
        return float(v.strip())
    except (ValueError, AttributeError):
        return 0.0


def nullable(v):
    v = (v or "").strip()
    if v in ("[N/A]", "N/A", ""):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def read_gpus():
    out = subprocess.run(
        ["nvidia-smi", "--query-gpu=" + FIELDS, "--format=csv,noheader,nounits"],
        capture_output=True, text=True, timeout=10,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip() or "nvidia-smi failed")
    gpus = []
    for line in out.stdout.strip().splitlines():
        p = [s.strip() for s in line.split(", ")]
        if len(p) < 19:
            continue
        gpus.append({
            "index": int(num(p[0])),
            "name": p[1],
            "uuid": p[2],
            "gpuUtilization": num(p[3]),
            "memoryUtilization": num(p[4]),
            "vramUsedGb": num(p[5]) / 1024,
            "vramTotalGb": num(p[6]) / 1024,
            "vramFreeGb": num(p[7]) / 1024,
            "temperatureCelsius": num(p[8]),
            "temperatureMemoryCelsius": nullable(p[9]),
            "fanSpeedPercent": nullable(p[10]),
            "powerDrawWatts": num(p[11]),
            "powerLimitWatts": num(p[12]),
            "clockGraphicsMhz": num(p[13]),
            "clockMemoryMhz": num(p[14]),
            "clockSmMhz": num(p[15]),
            "pcieGen": nullable(p[16]),
            "pcieLinkWidth": nullable(p[17]),
            "eccErrors": nullable(p[18]),
        })
    return gpus


def read_log_tail(tail_lines):
    if not os.path.exists(LOG_FILE):
        return [], 0
    size = os.path.getsize(LOG_FILE)
    start = max(0, size - TAIL_WINDOW)
    with open(LOG_FILE, "rb") as f:
        f.seek(start)
        data = f.read()
    lines = data.decode("utf-8", errors="replace").splitlines()
    if start > 0 and lines:
        lines = lines[1:]  # drop the partial line the window cut through
    return lines[-tail_lines:], size


def read_log_from(offset):
    if not os.path.exists(LOG_FILE):
        return "", 0, 0
    size = os.path.getsize(LOG_FILE)
    if offset > size or offset < 0:
        offset = 0  # file was truncated/rotated — restart from the top
    with open(LOG_FILE, "rb") as f:
        f.seek(offset)
        data = f.read(MAX_CHUNK)
    return data.decode("utf-8", errors="replace"), offset + len(data), size


class Handler(http.server.BaseHTTPRequestHandler):
    # Silence request logging: the platform parses pod logs for download
    # progress, and agent noise would pollute them.
    def log_message(self, *args):
        pass

    def _send(self, code, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/healthz":
            return self._send(200, {"ok": True})
        if url.path not in ("/metrics", "/logs"):
            return self._send(404, {"error": "not found"})
        bearer = self.headers.get("Authorization", "") or ""
        alt = self.headers.get("X-LLMPanel-Token", "") or ""
        # Fail closed: no configured token means no access.
        if not TOKEN or (bearer != "Bearer " + TOKEN and alt != TOKEN):
            return self._send(401, {"error": "unauthorized"})
        try:
            if url.path == "/metrics":
                return self._send(200, {"gpus": read_gpus()})
            q = urllib.parse.parse_qs(url.query)
            if "offset" in q:
                chunk, offset, size = read_log_from(int(q["offset"][0]))
                return self._send(200, {"chunk": chunk, "offset": offset, "size": size})
            tail = max(1, min(int(q.get("tail", ["500"])[0]), 5000))
            lines, size = read_log_tail(tail)
            return self._send(200, {"lines": lines, "size": size})
        except Exception as e:
            return self._send(500, {"error": str(e)})


http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
`.trimStart()
