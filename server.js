/**
 * NimehuyTV — JIYYAD TOOLS
 * Proxy AnimeIn (animeinweb.com)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = 'https://animeinweb.com';
const PROXY = BASE + '/api/proxy';
const SECRET = 'animein-secure-proxy-key-123';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function api(endpoint, params = {}) {
  const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const { data, status } = await axios.get(PROXY + clean, {
    params,
    timeout: 25000,
    headers: {
      'User-Agent': UA,
      Referer: BASE + '/',
      Origin: BASE,
      'x-proxy-secret': SECRET,
      Accept: 'application/json, text/plain, */*',
    },
    validateStatus: () => true,
  });
  if (status !== 200) throw new Error('API status ' + status);
  if (data?.error || (data?.status && data.status !== 200)) {
    throw new Error(data?.message || 'API ditolak');
  }
  return data?.data;
}

function mapAnime(item) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    synonyms: item.synonyms || '',
    type: item.type || '',
    status: item.status || '',
    views: item.views || '0',
    favorites: item.favorites || '0',
    year: item.year || '',
    day: item.day || '',
    genre: item.genre
      ? String(item.genre)
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : [],
    poster: item.image_poster || item.poster || '',
    cover: item.image_cover || item.cover || '',
    synopsis: (item.synopsis || '').trim(),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'NimehuyTV', brand: 'JIYYAD TOOLS' });
});

app.get('/api/home', async (_req, res) => {
  try {
    const data = await api('/3/2/home/data');
    res.json({
      status: true,
      popular: (data?.popular || []).map(mapAnime),
      hot: (data?.hot || []).map(mapAnime),
      new: (data?.new || []).map(mapAnime),
      waiting: (data?.waiting || []).map(mapAnime),
      random: (data?.random || []).map(mapAnime),
      slider: data?.slider || [],
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const keyword = (req.query.q || '').trim();
    const page = req.query.page || 0;
    if (!keyword) return res.json({ status: true, results: [] });
    const data = await api('/3/2/explore/movie', {
      page: String(page),
      sort: 'views',
      keyword,
    });
    const movies = Array.isArray(data?.movie) ? data.movie : [];
    res.json({ status: true, results: movies.map(mapAnime) });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message, results: [] });
  }
});

app.get('/api/detail/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [detailData, epData] = await Promise.all([
      api(`/3/2/movie/detail/${id}`),
      api(`/3/2/movie/episode/${id}`, { page: '0' }).catch(() => null),
    ]);
    const movie = detailData?.movie;
    if (!movie) throw new Error('Anime tidak ditemukan');
    const episodes = Array.isArray(epData?.episode)
      ? epData.episode
      : detailData?.episode
      ? [detailData.episode]
      : [];
    res.json({
      status: true,
      anime: mapAnime(movie),
      seasons: (detailData?.season || []).map(mapAnime),
      episodes: episodes.map((ep) => ({
        id: ep.id,
        index: ep.index || '',
        title: ep.title || `Episode ${ep.index}`,
        views: ep.views || '0',
        date: ep.key_time || '',
        image: ep.image || '',
      })),
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/episodes/:id', async (req, res) => {
  try {
    const page = req.query.page || 0;
    const data = await api(`/3/2/movie/episode/${req.params.id}`, {
      page: String(page),
    });
    const list = Array.isArray(data?.episode) ? data.episode : [];
    res.json({
      status: true,
      episodes: list.map((ep) => ({
        id: ep.id,
        index: ep.index || '',
        title: ep.title || `Episode ${ep.index}`,
        views: ep.views || '0',
        date: ep.key_time || '',
        image: ep.image || '',
      })),
    });
  } catch (e) {
    res.status(500).json({ status: false, error: e.message });
  }
});

app.get('/api/stream/:episodeId', async (req, res) => {
  try {
    const data = await api(`/3/2/episode/streamnew/${req.params.episodeId}`);
    const ep = data?.episode || {};
    const servers = Array.isArray(data?.server) ? data.server : [];
    const direct = [];
    const embed = [];
    for (const s of servers) {
      const item = {
        id: s.id,
        name: s.name || '',
        quality: s.quality || '',
        type: s.type || '',
        size: s.key_file_size ? `${parseFloat(s.key_file_size).toFixed(1)}MB` : null,
        link: s.link,
      };
      if (s.type === 'direct' || /\.mp4/i.test(String(s.link || ''))) direct.push(item);
      else embed.push(item);
    }
    res.json({
      status: true,
      episode: {
        id: ep.id || req.params.episodeId,
        index: ep.index || '',
        title: ep.title || '',
        animeId: ep.id_movie || '',
      },
      nextEpisode: data?.episode_next
        ? {
            id: data.episode_next.id,
            index: data.episode_next.index,
            title: data.episode_next.title,
          }
        : null,
      direct,
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

app.listen(PORT, () => console.log(`NimehuyTV → http://localhost:${PORT}`));
