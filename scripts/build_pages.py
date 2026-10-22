"""Build only public assets. Pass --api-url when the backend is deployed."""
import argparse
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--api-url', default='')
args = parser.parse_args()
if args.api_url and (urlsplit(args.api_url).scheme != 'https' or not urlsplit(args.api_url).hostname):
    parser.error('--api-url must be an HTTPS endpoint')
root = Path(__file__).resolve().parent.parent
out = Path(args.output).resolve()
if out == root or root in out.parents:
    parser.error('Choose an output directory outside the project')
out.mkdir(parents=True, exist_ok=True)
for name in ['index.html','app.js','booking-api.js','config.js','data.js','robots.txt','.nojekyll']:
    shutil.copy2(root / name, out / name)
for name in ['fonts','img']:
    shutil.copytree(root / name, out / name, dirs_exist_ok=True)
with (out / 'config.js').open('a') as file:
    file.write('\n// Public Pages build: backend endpoint, never credentials.\nwindow.BAR.webhookUrl = ' + json.dumps(args.api_url) + ';\n')
print('Public site built:', out)
