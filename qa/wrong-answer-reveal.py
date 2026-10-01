"""Test driver: proves the Math Blasters wrong-tap reveal works.

Loads the locally-served arcade, plays Math Blasters, taps a WRONG answer
bubble (computed from the visible prompt — no test hooks), and captures:
  1. the moment of the wrong tap,
  2. the correct answer floating/glowing mid-reveal,
  3. the held reveal (gold glow, game paused),
  4. the next wave after resume (game continued normally).
"""
import json, subprocess, time, base64, urllib.request, sys, os
import websocket

PORT = 9334
BASE = os.environ.get('REVEAL_BASE', 'file:///home/hatch/workspace/letter-reversal-game-pages/docs/index.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/reveal-test'
W, H = 390, 700  # phone-ish viewport, like Eliot's device

proc = subprocess.Popen(['/opt/meta-chromium/chrome', '--headless', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-component-update',
    f'--remote-debugging-port={PORT}', '--remote-debugging-address=127.0.0.1', '--remote-allow-origins=*',
    '--allow-file-access-from-files',
    'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(100):
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/list', timeout=2))
            pages = [t for t in targets if t.get('type') == 'page']
            if pages: ws_url = pages[0]['webSocketDebuggerUrl']; break
        except Exception: time.sleep(0.2)
    if not ws_url: raise RuntimeError('no debuggable page')
    ws = websocket.create_connection(ws_url, timeout=30)
    seq = [0]
    def send(method, params=None):
        seq[0] += 1
        ws.send(json.dumps({'id': seq[0], 'method': method, 'params': params or {}}))
        while True:
            r = json.loads(ws.recv())
            if r.get('id') == seq[0]:
                if 'error' in r: raise RuntimeError(r['error'])
                return r.get('result', {})
    def evaluate(js):
        r = send('Runtime.evaluate', {'expression': js, 'returnByValue': True})
        return (r.get('result') or {}).get('value')
    def shot(name):
        res = send('Page.captureScreenshot', {'format': 'png', 'fromSurface': True})
        open(f'{OUT}-{name}.png', 'wb').write(base64.b64decode(res['data']))
        print('SHOT', name)
    def click_at(x, y):
        send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
        time.sleep(0.05)
        send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x, 'y': y, 'button': 'left', 'clickCount': 1})
    def click_selector(sel, timeout=15):
        pt = None
        end = time.time() + timeout
        while time.time() < end:
            pt = evaluate(f"(()=>{{const el=document.querySelector({sel!r});if(!el)return null;el.scrollIntoView({{block:'center'}});const r=el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2];}})()")
            if pt:
                break
            time.sleep(0.5)
        assert pt, f'nothing matched {sel}'
        time.sleep(0.4)
        click_at(*pt)

    send('Page.enable')
    send('Runtime.enable')
    send('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2, 'mobile': True})
    send('Page.navigate', {'url': BASE})
    time.sleep(3)
    click_selector('[aria-label="Play Math Blasters"]')
    time.sleep(1.5)
    # pick the +1 set
    click_selector('[aria-label^="Play +1,"]')
    time.sleep(2.5)
    # read the prompt, compute the answer, find a WRONG bubble
    info = evaluate("""(()=>{
      const h1 = document.querySelector('#tap-prompt');
      const btns = [...document.querySelectorAll('button.answer-target')].map(b=>{
        const r=b.getBoundingClientRect(); return {label:b.textContent.trim(), x:r.left+r.width/2, y:r.top+r.height/2};
      });
      return {prompt: h1 ? h1.textContent : null, btns};
    })()""")
    print('PROMPT:', info['prompt'], 'BUBBLES:', [b['label'] for b in info['btns']])
    m = __import__('re').match(r'(\d+)\s*([+−])\s*(\d+)', info['prompt'] or '')
    assert m, 'could not parse prompt'
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    answer = a + b if op == '+' else a - b
    wrong = [t for t in info['btns'] if t['label'] != str(answer)]
    assert wrong, 'no wrong bubble found?!'
    print('ANSWER:', answer, 'TAPPING WRONG:', wrong[0]['label'])
    shot('1-before')
    click_at(wrong[0]['x'], wrong[0]['y'])
    time.sleep(0.15)
    state = evaluate("document.querySelector('button.answer-target.revealed') ? document.querySelector('button.answer-target.revealed').textContent : 'NONE'")
    print('REVEALED BUBBLE:', state)
    shot('2-tap')
    time.sleep(0.45)
    shot('3-midreveal')
    time.sleep(0.5)
    shot('4-held')
    time.sleep(1.2)
    shot('5-resumed')
    # confirm the game moved on to a fresh wave
    prompt2 = evaluate("document.querySelector('#tap-prompt').textContent")
    print('PROMPT AFTER:', prompt2)
    ws.close()
finally:
    proc.terminate()
print('DONE')
