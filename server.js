/**
 * NimehuyTV — JIYYAD TOOLS
 * Scraper: AnimeKai (animekai.com.ro)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://animekai.com.ro';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: BASE_URL + '/',
    'Upgrade-Insecure-Requests': '1',
  },
  validateStatus: () => true,
});

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const abs = (url) => {
  try {
    return url ? new URL(url, BASE_URL).toString() : null;
  } catch {
    return null;
  }
};
const decodeBase64 = (b64) => {
  try {
    return Buffer.from(b64 || '', 'base64').toString('utf8');
  } catch {
    return '';
  }
};
const extractIframeSrc = (html) =>
  html?.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || null;

async function fetchHTML(pathOrUrl, params = {}) {
  const { data, status } = await http.get(pathOrUrl, { params });
  if (status === 403) throw new Error('403 Forbidden (Cloudflare?)');
  if (status >= 400) throw new Error('HTTP ' + status);
  return cheerio.load(data);
}

function parseAItem($, el) {
  const $el = $(el);
  const titleEl = $el.find('.title').first();
  const href =
    titleEl.attr('href') ||
    $el.find('a.poster').attr('href') ||
    $el.attr('href') ||
    $el.find('a').attr('href');
  return {
    title: clean(titleEl.text()) || clean($el.attr('title')),
    japaneseTitle: clean(titleEl.attr('data-jp') || $el.find('[data-jp]').attr('data-jp')),
    url: abs(href),
    poster: abs($el.find('img').attr('src') || $el.find('img').attr('data-src')),
    subEpisode: clean($el.find('.sub').text()),
    dubEpisode: clean($el.find('.dub').text()),
    type: clean($el.find('.info span b, .typez').first().text()),
  };
}

function parseBsx($, el) {
  const $el = $(el);
  const a = $el.find('a').first();
  const href = a.attr('href') || $el.attr('href');
  const title = clean(
    a.attr('title') ||
      $el.find('.tt span a').text() ||
      $el.find('.tt span').text() ||
      $el.find('.inf span a').text() ||
      $el.find('.title').text()
  );
  return {
    title,
    japaneseTitle: clean($el.find('[data-jp]').attr('data-jp')),
    url: abs(href),
    poster: abs($el.find('img').attr('src') || $el.find('img').attr('data-src')),
    type: clean($el.find('.typez').text()),
    subEpisode: clean($el.find('.sub').text()),
    dubEpisode: clean($el.find('.dub').text()),
  };
}

function parseEpisodeList($) {
  const episodes = [];
  $('.ak-cl-eps li').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a').first();
    episodes.push({
      number: clean($el.attr('data-num') || $el.find('.gnum').text()),
      title: clean(a.attr('title') || $el.find('.ttl').text()),
      url: abs(a.attr('href')),
      date: clean($el.find('.date').text()),
      thumbnail: abs($el.find('img').attr('src') || $el.find('img').attr('data-src')),
      isCurrent: $el.hasClass('active'),
    });
  });
  if (episodes.length) return episodes;

  $('.eplister ul li, .episodelist ul li, .episodelist li').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a').first();
    episodes.push({
      number: clean($el.find('.epl-num, .num').text()),
      title: clean($el.find('.epl-title, .ttl, .title').text() || a.attr('title')),
      url: abs(a.attr('href')),
      date: clean($el.find('.epl-date, .date').text()),
    });
  });
  if (episodes.length) return episodes;

  $('a[href*="episode-"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const title = clean($el.attr('title') || $el.text());
    const url = abs(href);
    if (!href || !title || !url) return;
    if (!episodes.some((ep) => ep.url === url)) {
      episodes.push({ number: title.match(/\d+/)?.[0] || '', title, url });
    }
  });
  return episodes;
}

function parseSeriesInfo($) {
  const info = {};
  $('.ak-cl-spe span, .bigcontent .infox .spe span').each((_, el) => {
    const text = clean($(el).text());
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      info[match[1].trim().toLowerCase().replace(/\s+/g, '_')] = match[2].trim();
    }
  });
  const genres = $('.ak-cl-genres a, .bigcontent .infox .genxed a')
    .map((_, el) => ({ name: clean($(el).text()), url: abs($(el).attr('href')) }))
    .get();
  return {
    title: clean(
      $('.ak-cl-title').text() ||
        $('.bigcontent .infox h1').text() ||
        $('h1.entry-title').text()
    ),
    japaneseTitle: clean($('.ak-cl-alt').text() || $('.bigcontent .infox .alt').text()),
    url: abs($('.ak-cl-title a').attr('href') || $('.ak-cl-poster').attr('href')),
    poster: abs(
      $('.ak-cl-poster img').attr('src') ||
        $('.bigcontent .thum img').attr('src') ||
        $('meta[property="og:image"]').attr('content')
    ),
    type: info.type || clean($('.ak-cl-type').text()),
    status: info.status,
    released: info.released,
    season: info.season,
    duration: info.duration,
    totalEpisodes: info.episodes,
    score: clean($('.bigcontent .rt .rating').text()) || undefined,
    genres,
    description: clean(
      $('.ak-cl-desc').text() ||
        $('.entry-content p').first().text() ||
        $('meta[name="description"]').attr('content')
    ),
  };
}

function parseFeatured($) {
  return $('#featuredSwiper .swiper-slide')
    .map((_, el) => {
      const $el = $(el);
      const background = $el.attr('style')?.match(/url\(['"]?(.*?)['"]?\)/)?.[1] || '';
      return {
        title: clean($el.find('.title').text()),
        japaneseTitle: clean($el.find('.title').attr('data-jp')),
        background: abs(background),
        watchUrl: abs($el.find('.watch-btn').attr('href')),
        detailUrl: abs($el.find('.detail-btn').attr('href')),
        subEpisode: clean($el.find('.sub a').text() || $el.find('.sub').text()),
        type: clean($el.find('.info span b').text()),
        description: clean($el.find('.desc').text()),
      };
    })
    .get();
}

async function getHome() {
  const $ = await fetchHTML('/');
  const featured = parseFeatured($);
  const latestUpdates = $('#latest-updates .aitem-wrapper .aitem')
    .map((_, el) => parseAItem($, el))
    .get();
  const sections = $('#alistSwiper .swiper-slide')
    .map((_, el) => {
      const $el = $(el);
      return {
        section: clean($el.find('.stitle').text()),
        items: $el.find('.aitem').map((_, item) => parseAItem($, item)).get(),
      };
    })
    .get();
  const trending = $('#trending-anime .aitem')
    .map((_, el) => {
      const $el = $(el);
      const background = $el.attr('style')?.match(/url\(['"]?(.*?)['"]?\)/)?.[1] || '';
      return {
        rank: clean($el.find('.num').text()),
        title: clean($el.find('.title').text()),
        japaneseTitle: clean($el.find('.title').attr('data-jp')),
        url: abs($el.find('.title').attr('href')),
        poster: abs(background),
        subEpisode: clean($el.find('.sub a').text() || $el.find('.sub').text()),
        dubEpisode: clean($el.find('.dub a').text() || $el.find('.dub').text()),
        type: clean($el.find('.info span b').text()),
      };
    })
    .get();
  return { featured, latestUpdates, sections, trending };
}

async function searchAnime(query) {
  const $ = await fetchHTML('/', { s: query });
  const results = [];
  $('.aitem').each((_, el) => results.push(parseAItem($, el)));
  if (results.length) return { query, total: results.length, results };
  $('.bs .bsx, .bsx').each((_, el) => results.push(parseBsx($, el)));
  if (results.length) return { query, total: results.length, results };
  $('.listupd .lexa, .lexa').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a').first();
    results.push({
      title: clean($el.find('.dtl h2 a').text() || $el.find('.dtl h2').text() || a.attr('title')),
      url: abs(a.attr('href')),
      poster: abs($el.find('img').attr('src') || $el.find('img').attr('data-src')),
    });
  });
  return { query, total: results.length, results };
}

async function getAnimeDetail(animeUrl) {
  const url = abs(animeUrl);
  if (!url) throw new Error('URL anime tidak valid');
  const $ = await fetchHTML(url);
  return { ...parseSeriesInfo($), episodes: parseEpisodeList($), url };
}

async function getEpisode(episodeUrl) {
  const url = abs(episodeUrl);
  if (!url) throw new Error('URL episode tidak valid');
  const $ = await fetchHTML(url);
  const title = clean($('.entry-title').text());
  const series = parseSeriesInfo($);
  const episodeNumber = clean(
    $('meta[itemprop="episodeNumber"]').attr('content') ||
      $('.lm .epx').eq(1).text().replace(/episode/i, '')
  );
  const mainEmbed = abs($('#pembed iframe').attr('src'));
  const servers = $('.ak-srv-btn')
    .map((_, el) => {
      const $el = $(el);
      const embedHtml = decodeBase64($el.attr('data-value'));
      const embedSrc = extractIframeSrc(embedHtml);
      return {
        name: clean($el.text()),
        lang: clean($el.attr('data-lang')),
        active: $el.hasClass('active'),
        embedUrl: abs(embedSrc),
        type: 'embed',
        link: abs(embedSrc),
      };
    })
    .get()
    .filter((s) => s.embedUrl || s.link);
  const prev = abs($('.naveps a[rel="prev"]').attr('href'));
  const next = abs($('.naveps .nvs:last-child a').attr('href'));
  return {
    title,
    series,
    episodeNumber,
    player: { embedUrl: mainEmbed, servers },
    navigation: { prev, next },
    episodes: parseEpisodeList($),
  };
}

function toCard(item) {
  if (!item) return null;
  const id = item.url || item.detailUrl || item.watchUrl || item.title;
  return {
    id,
    title: item.title || '',
    type: item.type || '',
    year: '',
    status: item.subEpisode ? `SUB ${item.subEpisode}` : '',
    poster: item.poster || item.background || '',
    cover: item.background || item.poster || '',
    synopsis: item.description || '',
    url: item.url || item.detailUrl || item.watchUrl || '',
    subEpisode: item.subEpisode || '',
    dubEpisode: item.dubEpisode || '',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'NimehuyTV', brand: 'JIYYAD TOOLS', source: BASE_URL });
});

app.get('/api/home', async (_req, res) => {
  try {
    const home = await getHome();
    const hot = (home.trending || []).map(toCard).filter(Boolean);
    const latest = (home.latestUpdates || []).map(toCard).filter(Boolean);
    const fromSections = (home.sections || []).flatMap((s) => s.items || []).map(toCard).filter(Boolean);
    const featured = (home.featured || []).map((f) =>
      toCard({
        title: f.title,
        type: f.type,
        poster: f.background,
        background: f.background,
        description: f.description,
        url: f.detailUrl || f.watchUrl,
        detailUrl: f.detailUrl,
        watchUrl: f.watchUrl,
        subEpisode: f.subEpisode,
      })
    );
    res.json({
      status: true,
      popular: fromSections.slice(0, 24),
      hot: hot.length ? hot : featured,
      new: latest,
      waiting: [],
      random: [],
      slider: home.featured || [],
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ status: true, results: [] });
    const data = await searchAnime(q);
    res.json({
      status: true,
      results: (data.results || []).map(toCard).filter(Boolean),
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message, results: [] });
  }
});

app.get('/api/detail', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ status: false, error: 'url wajib' });
    const detail = await getAnimeDetail(url);
    const episodes = (detail.episodes || []).map((ep) => ({
      id: ep.url,
      index: ep.number || '',
      title: ep.title || `Episode ${ep.number}`,
      date: ep.date || '',
      image: ep.thumbnail || '',
      url: ep.url,
    }));
    res.json({
      status: true,
      anime: {
        id: detail.url || url,
        title: detail.title,
        type: detail.type,
        status: detail.status,
        year: detail.released,
        poster: detail.poster,
        cover: detail.poster,
        synopsis: detail.description,
        genre: (detail.genres || []).map((g) => g.name || g),
        url: detail.url || url,
      },
      seasons: [],
      episodes,
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

// keep :id route as base64url of anime url for frontend compatibility
app.get('/api/detail/:id', async (req, res) => {
  try {
    let url = req.params.id;
    try {
      url = Buffer.from(req.params.id, 'base64url').toString('utf8');
    } catch (_) {}
    if (!/^https?:\/\//i.test(url)) {
      // maybe already path
      url = abs(url.startsWith('/') ? url : '/' + url) || url;
    }
    const detail = await getAnimeDetail(url);
    const episodes = (detail.episodes || []).map((ep) => ({
      id: ep.url ? Buffer.from(ep.url).toString('base64url') : '',
      index: ep.number || '',
      title: ep.title || `Episode ${ep.number}`,
      date: ep.date || '',
      image: ep.thumbnail || '',
      url: ep.url,
    }));
    res.json({
      status: true,
      anime: {
        id: Buffer.from(detail.url || url).toString('base64url'),
        title: detail.title,
        type: detail.type,
        status: detail.status,
        year: detail.released,
        poster: detail.poster,
        cover: detail.poster,
        synopsis: detail.description,
        genre: (detail.genres || []).map((g) => g.name || g),
        url: detail.url || url,
      },
      seasons: [],
      episodes,
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/stream/:episodeId', async (req, res) => {
  try {
    let url = req.params.episodeId;
    try {
      url = Buffer.from(req.params.episodeId, 'base64url').toString('utf8');
    } catch (_) {}
    if (!/^https?:\/\//i.test(url)) url = abs(url) || url;
    const ep = await getEpisode(url);
    const servers = [];
    if (ep.player?.embedUrl) {
      servers.push({
        id: 'main',
        name: 'Main',
        quality: '',
        type: 'embed',
        link: ep.player.embedUrl,
      });
    }
    for (const s of ep.player?.servers || []) {
      if (s.embedUrl || s.link) {
        servers.push({
          id: s.name,
          name: s.name || 'Server',
          quality: s.lang || '',
          type: 'embed',
          link: s.embedUrl || s.link,
        });
      }
    }
    const embed = servers.filter((s) => s.type === 'embed');
    res.json({
      status: true,
      episode: {
        id: req.params.episodeId,
        index: ep.episodeNumber,
        title: ep.title,
        animeId: '',
      },
      nextEpisode: ep.navigation?.next
        ? {
            id: Buffer.from(ep.navigation.next).toString('base64url'),
            index: '',
            title: 'Next',
          }
        : null,
      direct: [],
      embed,
      servers,
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`NimehuyTV (AnimeKai) → http://localhost:${PORT}`));
