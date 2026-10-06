import urllib.request
import re

url = "http://127.0.0.1:5000/"
print(f"Connecting to live DOM at {url}...")

try:
    with urllib.request.urlopen(url) as response:
        status = response.status
        html = response.read().decode("utf-8")
        print(f"HTTP Status: {status}")
        print(f"Total HTML Bytes: {len(html)}")
        
        # Check splash CSS
        has_splash_css = "pdi-splash-isolated-css" in html
        print(f"[DOM Check] <style id='pdi-splash-isolated-css'> present: {has_splash_css}")
        
        # Check splash overlay container
        has_overlay = 'id="pdi-splash-overlay"' in html
        print(f"[DOM Check] <div id='pdi-splash-overlay'> present: {has_overlay}")
        
        # Check splash box and inner elements
        has_box = "pdi-splash-box" in html
        has_badge = "pdi-badge-frame" in html
        has_logo = "pdi-logo.jpg" in html
        has_bar = 'id="pdi-splash-bar"' in html
        
        print(f"[DOM Check] .pdi-splash-box: {has_box}")
        print(f"[DOM Check] .pdi-badge-frame: {has_badge}")
        print(f"[DOM Check] img/pdi-logo.jpg: {has_logo}")
        print(f"[DOM Check] #pdi-splash-bar: {has_bar}")
        
        # Extract the exact splash markup
        match = re.search(r'(<!-- Splash Screen.*?<aside)', html, re.DOTALL)
        if match:
            print("\n--- DOM Splash Component Markup ---")
            print(match.group(1).strip()[:-6])
            print("-----------------------------------")
        else:
            print("Could not isolate splash markup block.")
            
except Exception as e:
    print(f"Error querying live server: {e}")
