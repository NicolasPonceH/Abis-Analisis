import sys
with open('siad/app.py', 'r', encoding='utf-8') as f:
    c = f.read()

old = """@app.before_request
def adjust_script_root():
    if request.headers.get("X-Forwarded-Prefix"):
        request.environ["SCRIPT_NAME"] = request.headers["X-Forwarded-Prefix"]"""
        
new = """from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_prefix=1)"""

c = c.replace(old, new)

with open('siad/app.py', 'w', encoding='utf-8') as f:
    f.write(c)
