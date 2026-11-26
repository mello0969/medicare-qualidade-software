import bundleUrl from 'swagger-ui-dist/swagger-ui-bundle.js?url';
import 'swagger-ui-dist/swagger-ui.css';

const script = document.createElement('script');
script.src = bundleUrl;
script.onload = () => {
  window.SwaggerUIBundle({
    dom_id: '#swagger-ui',
    url: '/api/openapi.json',
    validatorUrl: null,
    deepLinking: true,
    persistAuthorization: false,
    showMutatedRequest: false,
    requestInterceptor: async (request) => {
      const url = new URL(request.url, location.href);
      if (url.origin !== location.origin)
        throw new Error('A documentação usa apenas a API desta origem.');
      if (
        ['POST', 'PUT', 'PATCH'].includes(request.method?.toUpperCase()) &&
        !['/api/auth/login', '/api/responses'].includes(url.pathname)
      ) {
        const result = await fetch('/api/auth/session', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (result.ok) {
          const { csrfToken } = await result.json();
          if (csrfToken) request.headers['X-CSRF-Token'] = csrfToken;
        }
      }
      return request;
    },
  });
};
script.onerror = () => {
  document.getElementById('swagger-ui').textContent =
    'Não foi possível carregar a documentação. Recarregue a página.';
};
document.head.append(script);
