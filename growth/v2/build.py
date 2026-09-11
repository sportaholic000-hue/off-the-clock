from pathlib import Path
root=Path(__file__).resolve().parent
html=(root/'index.template.html').read_text()
for token,path in [('/*__STYLES__*/','styles.css'),('/*__MATH__*/','profit-math.js'),('/*__INTAKE__*/','intake-model.js'),('/*__APP__*/','app.js')]:
 html=html.replace(token,(root/path).read_text())
(root/'Off_The_Clock_Growth_Preview.html').write_text(html)
print('Created single-file, offline preview:', len(html.encode()), 'bytes')
