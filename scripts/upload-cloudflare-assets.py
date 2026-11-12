"""Upload assets with a one-hour scoped token supplied through protected stdin only."""
import sys,json,pathlib,base64,mimetypes,urllib.request,uuid
root=pathlib.Path(__file__).resolve().parents[1]
config=json.loads(sys.stdin.readline())
paths=json.loads((root/'.output/asset-paths.json').read_text())
completion=config['jwt']
try:
 for bucket in config['buckets']:
  boundary='mohra-'+uuid.uuid4().hex;parts=[]
  for h in bucket:
   p=pathlib.Path(paths[h]);typ=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
   parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{h}"; filename="{h}"\r\nContent-Type: {typ}\r\n\r\n'.encode(),base64.b64encode(p.read_bytes()),b'\r\n'])
  parts.append(f'--{boundary}--\r\n'.encode())
  req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+config['accountId']+'/workers/assets/upload?base64=true',data=b''.join(parts),headers={'Authorization':'Bearer '+config['jwt'],'Content-Type':'multipart/form-data; boundary='+boundary},method='POST')
  with urllib.request.urlopen(req,timeout=60) as response:result=json.load(response)
  if not result.get('success'):raise ValueError('Asset upload rejected')
  completion=result.get('result',{}).get('jwt') or result.get('jwt') or completion
 print(json.dumps({'jwt':completion,'uploaded':sum(len(b) for b in config['buckets'])}),flush=True)
except Exception as error:
 print(json.dumps({'error':type(error).__name__}),flush=True);sys.exit(1)
