from pathlib import Path
from lxml import html
from urllib.parse import urljoin
import re,json,hashlib,subprocess,shutil
import argparse
parser=argparse.ArgumentParser(description="Extract the supplied GISForum snapshot without executing its JavaScript")
parser.add_argument("--source",type=Path,required=True)
parser.add_argument("--original-html",type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
src=args.source.resolve();dst=root/'docs/gisvn/classic';out=root/'script/gisvn/data'
dst.mkdir(parents=True,exist_ok=True);out.mkdir(parents=True,exist_ok=True)
raw=(src/'docs/index.html').read_text(); tuples=json.loads(re.search(r'window.GISVN_FORUM_DATA=(.*?);</script>',raw,re.S).group(1))
original=html.fromstring(args.original_html.read_text())
web=html.fromstring(raw)
def text(el):return re.sub(r'\s+',' ',el.text_content()).strip() if el is not None else ''
def first(el,path):
 a=el.xpath(path);return a[0] if a else None
def archive(href):
 if not href:return None
 if href.startswith('https://web.archive.org/'):return href
 if href.startswith('/web/'):return 'https://web.archive.org'+href
 return 'https://web.archive.org/web/20160306013248/'+urljoin('http://gisvn.com.vn/',href)
def link(el):return {'title':text(el),'url':archive(el.get('href'))} if el is not None else None
original_groups=[]
for group in original.xpath('//li[contains(concat(" ",normalize-space(@class)," ")," L1 ")]'):
 a=first(group,'./div[contains(@class,"tcat")]//span[@class="forumtitle"]/a')
 g={'id':int(group.get('id')[3:]),'title':text(a),'forums':[]}
 for node in group.xpath('.//li[contains(concat(" ",normalize-space(@class)," ")," L2 ")]'):
  anchor=first(node,'.//h2//a');fid=int(re.search(r'(\d+)$',node.get('id')).group(1))
  description=text(first(node,'.//p[@class="forumdescription"]'))
  numbers=re.findall(r'(?:Chủ đề:|Bài gửi:)\s*([\d,]+)',description)
  f={'id':fid,'title':text(anchor),'topics':int(numbers[0].replace(',','')) if len(numbers)>0 else None,'posts':int(numbers[1].replace(',','')) if len(numbers)>1 else None,'last_topic':link(first(node,'.//p[@class="lastposttitle"]/a')),'last_author':text(first(node,'.//div[@class="lastpostby"]//a[contains(@class,"username")]')),'last_date':text(first(node,'.//p[@class="lastpostdate"]')),'url':archive(anchor.get('href')) if anchor is not None else None,'children':[]}
  for sub in node.xpath('.//li[@class="subforum"]/a'):f['children'].append({'id':int(re.search(r'forumdisplay.php/(\d+)',sub.get('href')).group(1)),'title':text(sub),'url':archive(sub.get('href'))})
  g['forums'].append(f)
 original_groups.append(g)
old_by_id={f['id']:f for g in original_groups for f in g['forums']}
groups=[]
for i,(title,desc,forums) in enumerate(tuples):
 g={'id':original_groups[i]['id'],'title':title,'description':desc,'forums':[]}
 for fid,name,topics,posts,last,author in forums:
  f={'id':int(fid),'title':name,'topics':int(topics.replace(',','')),'posts':int(posts.replace(',','')),'last_title':last,'last_author':author,'children':[]}
  old=old_by_id.get(int(fid));f['archived_reference']=old.get('url') if old else None
  # A newer/truncated title is not evidence that it points to the 2016 thread.
  f['last_topic_url']=None
  g['forums'].append(f)
 groups.append(g)
announcements=[]
for a in original.xpath('//li[@id="forum2"][not(contains(@class,"L2"))]//center/a'):announcements.append(link(a))
links={}
for a in original.xpath('//a[@href]'):
 href=a.get('href');m=re.search(r'(showthread|forumdisplay|member|showpost)\.php/(\d+)',href)
 if m:
  key=f'{m.group(1)}:{m.group(2)}';links.setdefault(key,{'kind':m.group(1),'legacy_id':int(m.group(2)),'title':text(a),'url':archive(href)})
member_nodes=original.xpath('//*[@id="vietvbb_topstats_s_content"]//div[@class="topx-bit"]')
members=[]
for node in member_nodes:
 a=first(node,'.//a[contains(@href,"member.php")]')
 if a is not None:members.append({'name':text(a),'url':archive(a.get('href')),'time':text(first(node,'.//em'))})
topics=[]
for node in original.xpath('//*[@id="vietvbb_topstats_t_content"]//div[@class="topx-bit"]'):
 a=first(node,'.//a[contains(@href,"showthread.php")]')
 if a is not None:topics.append({'title':a.get('title') or text(a),'url':archive(a.get('href')),'author':text(first(node,'.//a[contains(@href,"member.php")]'))})
dataset={'schema_version':1,'source':{'url':'https://base27-cvnss.github.io/GISForum/docs/','repository':'https://github.com/Base27-CVNSS/GISForum','commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=src,text=True).strip(),'note':'Static reconstruction; topic bodies and original database are not present.','claimed_wayback_entries':863,'available_wayback_manifest_entries':0},'gisforum':{'groups':groups,'stats':{'topics':4297,'posts':24799,'members':101617},'announcements':[text(x) for x in web.xpath('//*[contains(@class,"announcement-list")]/a')],'latest_topics':[text(x) for x in web.xpath('//*[contains(@class,"latest-list")]/a')],'members':[text(x) for x in web.xpath('//*[contains(@class,"member-list")]/span')]},'original_20160306':{'groups':original_groups,'stats':{'topics':4239,'posts':24627,'members':101013},'announcements':announcements,'members':members,'latest_topics':topics},'legacy_links':list(links.values())}
for p in [dst/'data.json',out/'gisforum-source.json']:p.write_text(json.dumps(dataset,ensure_ascii=False,indent=2)+'\n')
(dst/'data.js').write_text('window.GISVN_CLASSIC_DATA = '+json.dumps(dataset,ensure_ascii=False).replace('</','<\\/')+';\n')
manifest=[]
for p in sorted(src.rglob('*')):
 if p.is_file() and '.git' not in p.relative_to(src).parts:manifest.append({'path':str(p.relative_to(src)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(root/'docs/gisvn/sources/source-manifest.json').write_text(json.dumps({'repository':dataset['source'],'files':manifest},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'reference_groups':len(groups),'reference_forums':sum(len(g['forums']) for g in groups),'original_rows':sum(len(g['forums']) for g in original_groups),'original_nested':sum(len(f['children']) for g in original_groups for f in g['forums']),'original_members':len(members),'original_topx':len(topics),'legacy_links':len(links),'all_source_files':len(manifest)},ensure_ascii=False))
