"""Run K1-K10 against the actual HTTP-served game in headless Chrome.

Uses the existing Python Playwright installation. No game build is needed.
Run: python tests/run_acceptance.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from io import BytesIO
import json
import math
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding="utf-8")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/index.html"
results = {}
errors = []
requests = set()


def check(name, condition, evidence):
    results[name] = {"passed": bool(condition), "evidence": evidence}
    print(f"{name}: {'PASS' if condition else 'FAIL'} — {evidence}", flush=True)


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome", headless=True,
            args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        )
        context = browser.new_context(viewport={"width": 1280, "height": 720}, ignore_https_errors=True)

        def observe(page):
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            page.on("request", lambda request: requests.add(request.url))

        # Frozen RAF allows exact deterministic tick and lap-boundary checks.
        page = context.new_page()
        observe(page)
        page.add_init_script("window.requestAnimationFrame = () => 0;")
        page.goto(url)
        page.wait_for_function("Boolean(window.__game)", timeout=3000)
        shape = page.evaluate("""() => {
          const g = window.__game, s = g.state();
          return { scene: g.scene.isScene, camera: g.camera.isPerspectiveCamera,
            tick: typeof g.tick, state: typeof g.state, input: Object.values(g.input),
            stateValue: s, meshes: (() => { let n = 0; g.scene.traverse(o => { if(o.isMesh) n++; }); return n; })() };
        }""")
        state = shape["stateValue"]
        spacing = [math.dist(a, state["waypoints"][(i + 1) % len(state["waypoints"])])
                   for i, a in enumerate(state["waypoints"])]
        check("K1", shape["scene"] and shape["camera"] and shape["tick"] == "function"
              and shape["state"] == "function" and len(shape["input"]) == 5
              and all(isinstance(v, bool) for v in shape["input"])
              and len(state["rivals"]) >= 3 and len(state["waypoints"]) >= 12
              and state["totalLaps"] >= 3 and min(spacing) >= 8 and max(spacing) <= 30
              and not errors,
              f"{len(state['rivals'])} rivals; {len(spacing)} waypoints; gaps {min(spacing):.2f}–{max(spacing):.2f}; errors={errors}")
        canvas_png = page.locator("canvas").first.screenshot()
        image = Image.open(BytesIO(canvas_png)).convert("RGB")
        colors = len(set(image.resize((128, 72)).getdata()))
        check("K2", shape["meshes"] >= 30 and colors > 30,
              f"{shape['meshes']} meshes; {colors} sampled canvas colors")
        (ROOT / "log").mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT / "log" / "race-countdown.png"))
        countdown = page.evaluate("""() => {
          const g=window.__game, start=g.state(); g.input.up=true; g.tick(179);
          const before=g.state(); g.tick(121); return {start, before, after:g.state()};
        }""")
        check("K3", countdown["start"]["phase"] == "countdown"
              and countdown["before"]["phase"] == "countdown"
              and countdown["start"]["kart"] == countdown["before"]["kart"]
              and countdown["after"]["phase"] == "racing", "No movement for 179 steps; racing by step 300")

        # Real RAF and real keyboard events, including a 1.5-second acceleration hold.
        live = context.new_page()
        observe(live)
        live.goto(url)
        live.wait_for_function("Boolean(window.__game)", timeout=3000)
        live.evaluate("window.__game.tick(300)")
        start = live.evaluate("window.__game.state()")
        live.keyboard.down("ArrowUp")
        live.wait_for_timeout(1500)
        accelerated = live.evaluate("window.__game.state()")
        live.keyboard.up("ArrowUp")
        live.wait_for_timeout(500)
        coast = live.evaluate("window.__game.state()")
        distance = math.hypot(accelerated["kart"]["x"] - start["kart"]["x"],
                              accelerated["kart"]["z"] - start["kart"]["z"])
        check("K4", accelerated["kart"]["speed"] > 2 and distance > 0.1
              and coast["kart"]["speed"] < accelerated["kart"]["speed"],
              f"speed={accelerated['kart']['speed']:.2f}; movement={distance:.2f}; coast={coast['kart']['speed']:.2f}")
        live.close()

        def reset():
            page.keyboard.press("r")
            page.evaluate("window.__game.tick(180)")

        changes = []
        for turn in ["ArrowLeft", "ArrowRight"]:
            reset()
            page.keyboard.down("ArrowUp")
            page.evaluate("window.__game.tick(60)")
            heading = page.evaluate("window.__game.state().kart.heading")
            page.keyboard.down(turn)
            page.evaluate("window.__game.tick(40)")
            changes.append(page.evaluate("window.__game.state().kart.heading") - heading)
            page.keyboard.up(turn)
            page.keyboard.up("ArrowUp")
        check("K5", changes[0] * changes[1] < 0, f"left/right heading deltas={changes}")
        reset()
        page.keyboard.down("w")
        page.evaluate("window.__game.tick(65)")
        page.keyboard.down("a")
        page.keyboard.down("Shift")
        page.evaluate("window.__game.tick(1)")
        shifted = page.evaluate("window.__game.state().drifting")
        page.keyboard.up("Shift")
        page.keyboard.down("Space")
        page.evaluate("window.__game.tick(1)")
        spaced = page.evaluate("window.__game.state().drifting")
        check("K6", shifted and spaced, f"Shift drift={shifted}; Space drift={spaced}")
        for key in ["Space", "a", "w"]:
            page.keyboard.up(key)
        reset()
        before = page.evaluate("window.__game.state().rivals")
        page.evaluate("window.__game.tick(1200)")
        after = page.evaluate("window.__game.state().rivals")
        distances = [math.hypot(a["x"] - b["x"], a["z"] - b["z"]) for a, b in zip(after, before)]
        distinct = len({(round(k["x"], 5), round(k["z"], 5)) for k in after}) == len(after)
        check("K7", min(distances) > 20 and distinct, f"20s rival displacement={[round(d, 2) for d in distances]}; distinct={distinct}")

        reset()
        bot = page.evaluate("""() => {
          const g=window.__game, pts=g.state().waypoints;
          let target=1, steps=0, boundary=null, maxDeviation=0, placeValid=true;
          const norm=a=>Math.atan2(Math.sin(a),Math.cos(a));
          while(steps<43200 && g.state().phase!=='finished') {
            const s=g.state(), k=s.kart;
            let [tx,tz]=pts[target];
            if(Math.hypot(tx-k.x,tz-k.z)<5.0) { target=(target+1)%pts.length; [tx,tz]=pts[target]; }
            const error=norm(Math.atan2(tx-k.x,tz-k.z)-k.heading);
            Object.assign(g.input,{up:true,down:false,left:error < -0.045,right:error > 0.045,drift:false});
            g.tick(1); steps++;
            const next=g.state();
            if(s.lap===1 && next.lap===2) boundary={steps,lapTimeMs:next.lapTimeMs,bestLapMs:next.bestLapMs};
            placeValid=placeValid && Number.isInteger(next.place) && next.place>=1 && next.place<=next.rivals.length+1;
            let min=Infinity;
            for(let i=0;i<pts.length;i++) {
              const a=pts[i],b=pts[(i+1)%pts.length],dx=b[0]-a[0],dz=b[1]-a[1];
              const t=Math.max(0,Math.min(1,((next.kart.x-a[0])*dx+(next.kart.z-a[1])*dz)/(dx*dx+dz*dz)));
              min=Math.min(min,Math.hypot(next.kart.x-a[0]-dx*t,next.kart.z-a[1]-dz*t));
            }
            maxDeviation=Math.max(maxDeviation,min);
          }
          return {steps,boundary,state:g.state(),maxDeviation,placeValid};
        }""")
        check("K8", bot["boundary"] is not None and bot["boundary"]["lapTimeMs"] == 0
              and isinstance(bot["boundary"]["bestLapMs"], (int, float)), str(bot["boundary"]))
        check("K9", bot["state"]["phase"] == "finished"
              and bot["state"]["lap"] == bot["state"]["totalLaps"]
              and page.locator("#finish").is_visible(),
              f"phase={bot['state']['phase']}; steps={bot['steps']}; max centerline deviation={bot['maxDeviation']:.3f}")
        check("K10", bot["placeValid"], f"Place always in range; final={bot['state']['place']}")
        page.screenshot(path=str(ROOT / "log" / "race-finish.png"))
        page.click("#race-again")
        check("restart", page.evaluate("window.__game.state().phase") == "countdown", "Finish-screen button starts a fresh countdown")
        # Additional behavior: reverse, boundary confinement and exact fixed steps.
        page.evaluate("window.__game.tick(180); window.__game.input.down=true; window.__game.tick(120)")
        check("reverse", page.evaluate("window.__game.state().kart.speed") < 0, "Brake can drive backwards")
        reset()
        page.evaluate("window.__game.input.up=true;window.__game.tick(1800)")
        confined = page.evaluate("""() => {
          const s=window.__game.state(),p=s.kart,pts=s.waypoints;
          return Math.min(...pts.map((a,i)=>{const b=pts[(i+1)%pts.length],dx=b[0]-a[0],dz=b[1]-a[1];
          const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz)));
          return Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);}));
        }""")
        check("barrier", confined <= 11.401, f"Straight acceleration remains within {confined:.3f} units of road center")
        external = [u for u in requests if not u.startswith(f"http://127.0.0.1:{server.server_port}/")]
        check("network", all(u.startswith("https://cdn.jsdelivr.net/npm/three@0.186.1/") for u in external), external)
        check("console", not errors, errors)
        browser.close()
except Exception as exc:
    results["execution"] = {"passed": False, "evidence": str(exc)}
    print(f"Browser verification could not complete: {exc}", flush=True)
finally:
    server.shutdown()
    (ROOT / "log").mkdir(exist_ok=True)
    (ROOT / "log" / "acceptance-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

if not all(r["passed"] for r in results.values()) or len(results) < 10:
    raise SystemExit(1)
print("All K1–K10 acceptance checks passed.")
