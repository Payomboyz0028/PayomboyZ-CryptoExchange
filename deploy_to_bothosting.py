import os
import sys
import io
import time
import zipfile
import json
import requests

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

API_KEY = os.getenv("BOT_HOSTING_API_KEY", "bhk_cd6261ef0c0b5bb3eb8509379586f5c7538cf1b432ff2c91")
DEPLOYMENT_ID = os.getenv("BOT_HOSTING_DEPLOYMENT_ID", "0e3bb1f7-ed06-47f4-81f4-b98a7a82ba36")
BASE_URL = "https://bot-hosting.net/api/v1"
headers = {"Authorization": "Bearer " + API_KEY}


def get_upload_url():
    res = requests.post(BASE_URL + "/deployments/" + DEPLOYMENT_ID + "/files/upload-url", headers=headers, timeout=15)
    if res.status_code != 200:
        raise RuntimeError("Failed to get upload URL: " + str(res.status_code) + " " + res.text)
    return res.json().get("url")


def upload_zip(zip_bytes, name):
    url = get_upload_url()
    up = requests.post(url, files={"files": (name, zip_bytes, "application/zip")}, timeout=180)
    print("  Upload " + name + ": HTTP " + str(up.status_code))
    dc = requests.post(
        BASE_URL + "/deployments/" + DEPLOYMENT_ID + "/files/decompress",
        headers=dict(list(headers.items()) + [("Content-Type", "application/json")]),
        json={"root": "/", "file": name},
        timeout=30
    )
    print("  Decompress " + name + ": HTTP " + str(dc.status_code))


def build_zip(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for arc, src in entries:
            if isinstance(src, (bytes, bytearray)):
                zf.writestr(arc, src)
            else:
                zf.write(src, arc)
    return buf.getvalue()


def walk_dir(base_dir, dir_path, skip_suffixes=()):
    entries = []
    for root, dirs, files in os.walk(dir_path):
        arc_root = os.path.relpath(root, base_dir).replace("\\", "/") + "/"
        dirs[:] = [d for d in dirs if not any(
            (arc_root + d + "/").endswith(s.lstrip("/")) for s in skip_suffixes
        )]
        for f in files:
            fp = os.path.join(root, f)
            arc = os.path.relpath(fp, base_dir).replace("\\", "/")
            entries.append((arc, fp))
    return entries


def deploy():
    print("=" * 65)
    print("DEPLOY PAYOMBOYZ CRYPTO BOT -> BOT-HOSTING.NET CLOUD")
    print("Target Container: " + DEPLOYMENT_ID)
    print("=" * 65)

    # 1. Startup — skip npm install, run pre-bundled dist directly
    print("[1/6] Setting startup (no npm install)...")
    res = requests.patch(
        BASE_URL + "/deployments/" + DEPLOYMENT_ID + "/startup",
        headers=dict(list(headers.items()) + [("Content-Type", "application/json")]),
        json={
            "runtime": "nodejs",
            "runtimeVersion": "24",
            "entryFile": "dist/index.js",
            "startCommand": "exec node --max-old-space-size=220 ${STARTUP_FILE}"
        },
        timeout=15
    )
    print("  HTTP " + str(res.status_code))

    base_dir = os.path.dirname(os.path.abspath(__file__))

    # 2. Main bundle: dist + prisma + .env + package.json
    print("[2/6] Main bundle (dist + prisma + .env)...")
    lean_pkg = {
        "name": "payomboyz-crypto-exchange",
        "version": "1.0.0",
        "type": "module",
        "main": "dist/index.js",
        "scripts": {"start": "node dist/index.js"}
    }
    entries = [("package.json", json.dumps(lean_pkg, indent=2).encode())]

    env_p = os.path.join(base_dir, ".env")
    if os.path.exists(env_p):
        entries.append((".env", env_p))

    dist_dir = os.path.join(base_dir, "dist")
    if os.path.exists(dist_dir):
        entries += walk_dir(base_dir, dist_dir)

    prisma_dir = os.path.join(base_dir, "prisma")
    if os.path.exists(prisma_dir):
        for root, _, files in os.walk(prisma_dir):
            for f in files:
                if f.endswith(".sqlite3") or f.endswith(".sqlite3-journal"):
                    continue
                fp = os.path.join(root, f)
                arc = os.path.relpath(fp, base_dir).replace("\\", "/")
                entries.append((arc, fp))

    zb = build_zip(entries)
    sz_kb = len(zb) / 1024
    print("  Main bundle: " + str(round(sz_kb, 1)) + " KB (" + str(len(entries)) + " files)")
    upload_zip(zb, "deploy_main.zip")

    # 3-5. node_modules in 3 chunks — avoids OOM from npm install in container
    nm_dir = os.path.join(base_dir, "node_modules")
    if not os.path.exists(nm_dir):
        print("[!] node_modules missing — run: npm install --omit=dev first")
    else:
        SKIP = ("/test/", "/tests/", "/__tests__/", "/doc/", "/docs/",
                "/example/", "/examples/", "/benchmark/", "/benchmarks/")

        pkg_dirs = sorted([
            d for d in os.listdir(nm_dir)
            if os.path.isdir(os.path.join(nm_dir, d)) and d != ".bin"
        ])
        n = len(pkg_dirs)
        cs = n // 3
        chunks = [pkg_dirs[:cs], pkg_dirs[cs:2*cs], pkg_dirs[2*cs:]]

        for ci, chunk in enumerate(chunks, 1):
            step = ci + 2
            print("[" + str(step) + "/6] node_modules chunk " + str(ci) + "/3 (" + str(len(chunk)) + " pkgs)...")
            ents = []

            # .bin only in first chunk
            if ci == 1:
                bin_d = os.path.join(nm_dir, ".bin")
                if os.path.exists(bin_d):
                    for f in os.listdir(bin_d):
                        fp = os.path.join(bin_d, f)
                        arc = os.path.relpath(fp, base_dir).replace("\\", "/")
                        ents.append((arc, fp))

            for pkg in chunk:
                pkg_path = os.path.join(nm_dir, pkg)
                ents += walk_dir(base_dir, pkg_path, skip_suffixes=SKIP)

            zb = build_zip(ents)
            sz_mb = len(zb) / 1024 / 1024
            print("  Chunk " + str(ci) + ": " + str(round(sz_mb, 2)) + " MB (" + str(len(ents)) + " files)")
            upload_zip(zb, "deploy_nm_" + str(ci) + ".zip")

    # 6. Restart
    print("[6/6] Restarting container...")
    try:
        rp = requests.post(
            BASE_URL + "/deployments/" + DEPLOYMENT_ID + "/power",
            headers=dict(list(headers.items()) + [("Content-Type", "application/json")]),
            json={"action": "restart"},
            timeout=20
        )
        print("  HTTP " + str(rp.status_code))
    except Exception as e:
        print("  " + str(e))

    print("Waiting 18s for bot to boot...")
    time.sleep(18)

    try:
        lr = requests.get(BASE_URL + "/deployments/" + DEPLOYMENT_ID + "/logs", headers=headers, timeout=10)
        if lr.status_code == 200:
            lines = lr.json().get("lines", [])
            print("\n--- LIVE CONSOLE ---")
            for l in lines[-25:]:
                print("  " + l.rstrip())
            print("---\n")
    except Exception as e:
        print("  " + str(e))

    print("=" * 65)
    print("DONE - Crypto Bot deployed with pre-bundled node_modules!")
    print("=" * 65)
    return True


if __name__ == "__main__":
    deploy()
