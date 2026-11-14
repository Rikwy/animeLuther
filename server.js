const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

let animexScraper = null;
try {
  animexScraper = require('./animex');
} catch (e) {
  console.log('animex.js not found, using built-in fallbacks');
}

const PORT = process.env.PORT || 3000;
const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const ANILIST_GRAPHQL = 'https://graphql.anilist.co';

const RATE_LIMIT_WINDOW = 60_000;
const rateLimitStore = new Map();

function rateLimit(ip) {
  const now = Date.now();
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  const entry = rateLimitStore.get(ip);
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.windowStart = now;
    return true;
  }
  entry.count++;
  return entry.count <= 150;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return types[ext] || 'application/octet-stream';
}

async function anilistQuery(query, variables = {}) {
  const response = await fetch(ANILIST_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error('AniList request failed');
  return await response.json();
}

function formatAnilist(media) {
  const title = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown';
  return {
    id: media.id,
    idMal: media.idMal,
    title,
    romaji: media.title?.romaji || '',
    image: media.coverImage?.extraLarge || media.coverImage?.large || '',
    banner: media.bannerImage || '',
    format: media.format || 'TV',
    episodes: media.episodes || 0,
    status: media.status || 'RELEASING',
    year: media.seasonYear || '',
    score: media.averageScore || 0,
    genres: media.genres || [],
    description: media.description ? media.description.replace(/<[^>]+>/g, '').substring(0, 350) : ''
  };
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

  if (!rateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Too many requests' }));
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    // Health check
    if (reqUrl.pathname === '/health' || reqUrl.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', app: 'AnimeLuther' }));
    }

    // Trending / Home Feed
    if (reqUrl.pathname === '/api/home/recently-released') {
      const sortParam = reqUrl.searchParams.get('sort') || 'TRENDING_DESC';
      const gql = `query ($sort: [MediaSort]) {
        Page(page: 1, perPage: 40) {
          media(type: ANIME, sort: $sort, isAdult: false) {
            id idMal title { romaji english native } coverImage { extraLarge large color }
            bannerImage format episodes status seasonYear averageScore genres description
          }
        }
      }`;
      const json = await anilistQuery(gql, { sort: [sortParam, 'POPULARITY_DESC'] });
      const media = json?.data?.Page?.media || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ anilist: media.map(formatAnilist) }));
    }

    // Search
    if (reqUrl.pathname === '/api/anime/search') {
      const q = (reqUrl.searchParams.get('q') || '').trim();
      const gql = `query ($s: String) {
        Page(perPage: 30) {
          media(search: $s, type: ANIME, isAdult: false) {
            id idMal title { romaji english native } coverImage { extraLarge large color }
            bannerImage format episodes status seasonYear averageScore genres description
          }
        }
      }`;
      const json = await anilistQuery(gql, { s: q });
      const media = json?.data?.Page?.media || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ results: media.map(formatAnilist) }));
    }

    // Anime Details
    if (reqUrl.pathname === '/api/anilist/info') {
      const anilistId = parseInt(reqUrl.searchParams.get('anilistId') || '0', 10);
      const gql = `query ($id: Int) {
        Media(id: $id) {
          id idMal title { romaji english native } coverImage { extraLarge large }
          bannerImage format episodes status seasonYear averageScore genres description
          nextAiringEpisode { episode airingAt }
        }
      }`;
      const json = await anilistQuery(gql, { id: anilistId });
      const media = json?.data?.Media;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ resolved: { anilistId, info: media } }));
    }

    // Stream Resolver (Animex + Embed Fallbacks)
    if (reqUrl.pathname === '/api/megap/stream' || reqUrl.pathname === '/api/animex/stream') {
      const anilistId = reqUrl.searchParams.get('anilistId');
      const episode = parseInt(reqUrl.searchParams.get('episode') || '1', 10);
      const lang = reqUrl.searchParams.get('lang') || reqUrl.searchParams.get('type') || 'sub';

      let m3u8Url = null;
      let tracks = [];
      if (animexScraper && typeof animexScraper.animexSources === 'function') {
        try {
          const data = await animexScraper.animexSources(anilistId, episode, lang, '');
          const src = (data.sources || []).find((s) => /\.m3u8($|\?)/i.test(s.url || ''));
          if (src && !data.error) m3u8Url = src.url;
          tracks = data.tracks || data.subtitles || [];
        } catch (e) {}
      }

      // Reliable Embed Fallbacks using AniList ID
      const embedFallbacks = [
        { name: 'سيرفر Vidsrc (مترجم)', url: `https://vidsrc.icu/embed/anime/${anilistId}/${episode}/${lang === 'dub' ? 1 : 0}` },
        { name: 'سيرفر 2Anime', url: `https://2anime.xyz/embed/${anilistId}-episode-${episode}` },
        { name: 'سيرفر AutoEmbed', url: `https://player.autoembed.cc/embed/anime/${anilistId}/${episode}` }
      ];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ m3u8Url, tracks, embedFallbacks }));
    }

    // Proxy for HLS / Video
    if (reqUrl.pathname === '/proxy-video' || reqUrl.pathname === '/proxy') {
      const targetUrl = reqUrl.searchParams.get('url');
      if (!targetUrl) {
        res.writeHead(400);
        return res.end('Missing URL');
      }
      const proxyRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://animex.one/' }
      });
      const body = await proxyRes.arrayBuffer();
      res.writeHead(proxyRes.status, {
        'Content-Type': proxyRes.headers.get('content-type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(Buffer.from(body));
    }

    // Static File Serving (checks public/ first, then ROOT)
    let pathname = reqUrl.pathname;
    if (pathname === '/' || pathname === '/home') pathname = '/index.html';
    if (pathname === '/watch') pathname = '/watch.html';

    const cleanName = decodeURIComponent(pathname).replace(/^\/+/, '');
    const publicFilePath = path.resolve(PUBLIC_DIR, cleanName);
    const rootFilePath = path.resolve(ROOT, cleanName);

    let targetFile = null;
    if (publicFilePath.startsWith(PUBLIC_DIR)) {
      try {
        await fs.access(publicFilePath);
        targetFile = publicFilePath;
      } catch {}
    }
    if (!targetFile && rootFilePath.startsWith(ROOT)) {
      try {
        await fs.access(rootFilePath);
        targetFile = rootFilePath;
      } catch {}
    }

    if (!targetFile) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 - الصفحة غير موجودة</h1>');
    }

    const data = await fs.readFile(targetFile);
    res.writeHead(200, { 'Content-Type': getMimeType(targetFile) });
    return res.end(data);

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`AnimeLuther Server running smoothly on port ${PORT}`);
});
