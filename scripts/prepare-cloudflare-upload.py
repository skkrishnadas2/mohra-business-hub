"""Prepare reproducible static asset hashes and a compressed Worker upload (no credentials)."""
import pathlib,hashlib,json,gzip,base64
root=pathlib.Path(__file__).resolve().parents[1]
public=root/'.output/public'
manifest={}
paths={}
for p in sorted(public.rglob('*')):
 if not p.is_file() or p.name in ('_headers','_redirects','.DS_Store'):continue
 data=p.read_bytes(); name='/'+p.relative_to(public).as_posix(); h=hashlib.md5(data).hexdigest()
 manifest[name]={'hash':h,'size':len(data)};paths[h]=str(p)
(root/'.output/asset-manifest.json').write_text(json.dumps(manifest))
(root/'.output/asset-paths.json').write_text(json.dumps(paths))
worker=(root/'.output/server/index.mjs').read_bytes()
(root/'.output/worker.gz.b64').write_text(base64.b64encode(gzip.compress(worker)).decode())
print(json.dumps({'assets':len(manifest),'workerBytes':len(worker),'gzipBytes':len(gzip.compress(worker))}))
