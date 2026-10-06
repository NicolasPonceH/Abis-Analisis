import urllib.request
import re

urls = [
    'http://127.0.0.1:5000/',
    'http://127.0.0.1:5000/view/En_la_comuna_de_Arica.pruebapdf.pdf',
    'http://127.0.0.1:5000/view/sistema_analisis.pdf',
    'http://127.0.0.1:5000/estadisticas',
    'http://127.0.0.1:5000/historial'
]

for url in urls:
    print('========================================')
    print('Testing URL:', url)
    try:
        req = urllib.request.urlopen(url)
        print('Status:', req.status)
        content = req.read().decode('utf-8')
        m_title = re.search(r'<title>(.*?)</title>', content)
        print('Page title:', m_title.group(1) if m_title else 'No title')
        
        # Extract forms and buttons
        forms = re.findall(r'<form\s+action="([^"]+)"\s+method="([^"]+)"[^>]*>(.*?)</form>', content, re.DOTALL)
        print(f'Forms found ({len(forms)}):')
        for action, method, inner in forms:
            btn_match = re.search(r'<button[^>]*>(.*?)</button>', inner, re.DOTALL)
            btn_text = re.sub(r'<[^>]+>', '', btn_match.group(1)).strip() if btn_match else 'no button text'
            print(f'  [{method}] {action} -> Button: {btn_text}')
            
        # Extract export / download links
        links = re.findall(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', content, re.DOTALL)
        print('Relevant links:')
        for href, text in links:
            t = re.sub(r'<[^>]+>', '', text).strip()
            if any(k in href for k in ['export', 'upload', 'download', 'view']):
                print(f'  Link -> {href} ({t})')
                
    except Exception as e:
        print('ERROR:', e)
