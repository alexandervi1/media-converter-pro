const https = require('https');
const logger = require('../utils/logger');

class SpotifyService {
    isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return (
            /open\.spotify\.com\/(playlist|album|track)\/[a-zA-Z0-9]+/.test(url) ||
            /spotify\.link\/[a-zA-Z0-9]+/.test(url)
        );
    }

    extractId(url) {
        const match = url.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
        if (match) {
            return { type: match[1], id: match[2] };
        }
        return null;
    }

    async parsePlaylist(url) {
        if (!this.isValidUrl(url)) {
            throw new Error('URL de Spotify inválida');
        }

        const extracted = this.extractId(url);
        if (!extracted) {
            throw new Error('No se pudo extraer el ID de la playlist');
        }

        logger.info(`Parseando ${extracted.type} de Spotify: ${extracted.id}`);

        try {
            // 1. Oembed Metadata con timeout
            const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
            const oembedData = await this.fetchJson(oembedUrl);

            // 2. Tracks via Embed con timeout y fallback
            const embedUrl = `https://open.spotify.com/embed/${extracted.type}/${extracted.id}`;
            const tracks = await this.parseEmbed(embedUrl, extracted.type);

            if (tracks.length === 0) {
                throw new Error(
                    'No se pudieron obtener las canciones. Asegúrate de que sea pública.'
                );
            }

            return {
                id: extracted.id,
                type: extracted.type,
                title: oembedData?.title || `Spotify ${extracted.type}`,
                thumbnail: oembedData?.thumbnail_url || null,
                trackCount: tracks.length,
                tracks
            };
        } catch (error) {
            logger.error(`Error en SpotifyService: ${error.message}`);
            throw error;
        }
    }

    async parseEmbed(embedUrl, type) {
        return new Promise((resolve) => {
            const tracks = [];

            const req = https.get(
                embedUrl,
                {
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.9',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    timeout: 10000
                },
                (response) => {
                    let html = '';
                    response.on('data', (chunk) => {
                        html += chunk;
                    });
                    response.on('end', () => {
                        try {
                            // Buscar JSON __NEXT_DATA__
                            const scriptMatch = html.match(
                                /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/
                            );
                            if (scriptMatch) {
                                const jsonData = JSON.parse(scriptMatch[1]);
                                const entity = jsonData?.props?.pageProps?.state?.data?.entity;

                                if (entity) {
                                    let trackList =
                                        entity.trackList ||
                                        entity.tracks?.items ||
                                        entity.tracks ||
                                        [];
                                    trackList.forEach((item, index) => {
                                        const track = item.track || item;
                                        const trackName = track.title || track.name;
                                        const trackArtist =
                                            track.subtitle ||
                                            track.artists?.map((a) => a.name).join(', ') ||
                                            track.artistName ||
                                            'Unknown Artist';

                                        if (trackName) {
                                            tracks.push({
                                                id: track.uri || `track-${index}`,
                                                name: trackName,
                                                artist: trackArtist,
                                                duration: track.duration || 0,
                                                album: track.album?.name || entity.name || '',
                                                selected: true
                                            });
                                        }
                                    });
                                }
                            }

                            // Fallback Regex en caso de cambios en el esquema del script
                            if (tracks.length === 0) {
                                const trackMatches = html.matchAll(
                                    /data-testid="tracklist-row"[^>]*>.*?<span[^>]*>([^<]+)<\/span>.*?<span[^>]*>([^<]+)<\/span>/gs
                                );
                                for (const match of trackMatches) {
                                    tracks.push({
                                        id: `track-${tracks.length}`,
                                        name: match[1]?.trim() || 'Unknown',
                                        artist: match[2]?.trim() || 'Unknown',
                                        duration: 0,
                                        album: '',
                                        selected: true
                                    });
                                }
                            }

                            resolve(tracks);
                        } catch (e) {
                            logger.error('Error parsing spotify embed HTML', e.message);
                            resolve([]);
                        }
                    });
                }
            );

            req.on('timeout', () => {
                req.destroy();
                logger.warn('Timeout al conectar con Spotify Embed');
                resolve([]);
            });

            req.on('error', (err) => {
                logger.error('Error fetching spotify embed', err.message);
                resolve([]);
            });
        });
    }

    fetchJson(url) {
        return new Promise((resolve) => {
            const req = https.get(
                url,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 5000
                },
                (res) => {
                    let data = '';
                    res.on('data', (c) => (data += c));
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve(null);
                        }
                    });
                }
            );

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.on('error', () => resolve(null));
        });
    }
}

module.exports = new SpotifyService();
