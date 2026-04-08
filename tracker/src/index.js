const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // POST /track  — record a download click
    if (request.method === 'POST' && url.pathname === '/track') {
      try {
        const body = await request.json().catch(() => ({}));
        const event   = (body.event   || 'download_click').slice(0, 64);
        const variant = (body.variant || 'unknown').slice(0, 32);
        const ref     = (request.headers.get('Referer') || '').slice(0, 256);
        const ua      = (request.headers.get('User-Agent') || '').slice(0, 256);

        await env.DB.prepare(
          'INSERT INTO events (event, variant, referrer, ua, ts) VALUES (?, ?, ?, ?, ?)'
        ).bind(event, variant, ref, ua, Date.now()).run();

        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }
    }

    // GET /stats  — view download counts
    if (request.method === 'GET' && url.pathname === '/stats') {
      const total = await env.DB.prepare(
        "SELECT COUNT(*) as n FROM events WHERE event = 'download_click'"
      ).first();

      const byVariant = await env.DB.prepare(
        "SELECT variant, COUNT(*) as n FROM events WHERE event = 'download_click' GROUP BY variant ORDER BY n DESC"
      ).all();

      const byDay = await env.DB.prepare(
        "SELECT date(ts/1000, 'unixepoch') as day, COUNT(*) as n FROM events WHERE event = 'download_click' GROUP BY day ORDER BY day DESC LIMIT 30"
      ).all();

      return new Response(JSON.stringify({
        total_downloads: total?.n ?? 0,
        by_variant: byVariant.results,
        last_30_days: byDay.results,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
