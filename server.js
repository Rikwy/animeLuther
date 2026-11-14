const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const MIME = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml"};
const cache = new Map();
async function anilist(query, variables={}) {
  const key = JSON.stringify([query,variables]);
  const old = cache.get(key);
  if (old && Date.now()-old.time < 5*60*1000) return old.data;
  const r = await fetch("https://graphql.anilist.co", {
    method:"POST", headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({query,variables})
  });
  if (!r.ok) throw new Error("Anime catalog temporarily unavailable");
  const j = await r.json();
  if (j.errors) throw new Error("Anime catalog request failed");
  cache.set(key,{time:Date.now(),data:j.data});
  return j.data;
}
const fields = `id title { romaji english native } coverImage { extraLarge large } bannerImage description averageScore episodes seasonYear format status genres`;
const queries = {
  trending:`query { Page(page:1,perPage:18) { media(type:ANIME,sort:TRENDING_DESC,isAdult:false) { ${fields} } } }`,
  popular:`query { Page(page:1,perPage:18) { media(type:ANIME,sort:POPULARITY_DESC,isAdult:false) { ${fields} } } }`,
  search:`query ($q:String) { Page(page:1,perPage:24) { media(type:ANIME,search:$q,sort:SEARCH_MATCH,isAdult:false) { ${fields} } } }`,
  detail:`query ($id:Int) { Media(id:$id,type:ANIME) { ${fields} nextAiringEpisode { episode airingAt } } }`
};
function send(res,status,body,type="application/json; charset=utf-8") { res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body); }
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,"http://localhost");
  if(u.pathname.startsWith("/api/")){
    try {
      let data;
      if(u.pathname==="/api/trending") data=await anilist(queries.trending);
      else if(u.pathname==="/api/popular") data=await anilist(queries.popular);
      else if(u.pathname==="/api/search") {
        const q=(u.searchParams.get("q")||"").trim();
        if(!q) return send(res,200,JSON.stringify({media:[]}));
        data=await anilist(queries.search,{q});
      } else if(u.pathname==="/api/anime") {
        const id=Number(u.searchParams.get("id"));
        if(!Number.isInteger(id)||id<1) return send(res,400,JSON.stringify({error:"Invalid anime ID"}));
        data=await anilist(queries.detail,{id});
        data=data.Media;
      } else return send(res,404,JSON.stringify({error:"Not found"}));
      return send(res,200,JSON.stringify(data));
    } catch(e) { return send(res,502,JSON.stringify({error:e.message||"Request failed"})); }
  }
  let pathname=decodeURIComponent(u.pathname);
  if(pathname==="/") pathname="/index.html";
  const file=path.resolve(PUBLIC,"."+pathname);
  if(!file.startsWith(PUBLIC+path.sep)) return send(res,403,"Forbidden","text/plain");
  fs.readFile(file,(err,buf)=>{
    if(err) return send(res,404,"Not found","text/plain; charset=utf-8");
    send(res,200,buf,MIME[path.extname(file)]||"application/octet-stream");
  });
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Anime Luther running on ${PORT}`));
