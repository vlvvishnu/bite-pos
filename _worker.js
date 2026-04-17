export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only inject into HTML pages
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      const response = await env.ASSETS.fetch(request);
      let html = await response.text();

      // Replace the placeholder with the real key
      html = html.replace(
        "window.__BREVO_KEY__ || ''",
        `'${env.BREVO_API_KEY || ''}'`
      );

      return new Response(html, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    return env.ASSETS.fetch(request);
  }
};