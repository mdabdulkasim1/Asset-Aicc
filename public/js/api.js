/* Thin wrapper around fetch: attaches the token, unwraps errors. */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'assetreg.token';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* private mode - the session simply will not be remembered */
    }
  }

  function request(method, url, body) {
    var headers = { Accept: 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(url, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (response) {
      if (response.status === 204) return {};
      return response
        .json()
        .catch(function () {
          return { error: 'The server sent an unexpected reply.' };
        })
        .then(function (data) {
          if (!response.ok) {
            var error = new Error(data.error || 'Request failed.');
            error.status = response.status;
            if (response.status === 401 && token) {
              setToken('');
              global.dispatchEvent(new CustomEvent('auth:expired'));
            }
            throw error;
          }
          return data;
        });
    });
  }

  function query(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  global.api = {
    getToken: getToken,
    setToken: setToken,
    query: query,
    get: function (url) {
      return request('GET', url);
    },
    post: function (url, body) {
      return request('POST', url, body || {});
    },
    patch: function (url, body) {
      return request('PATCH', url, body || {});
    },
    del: function (url) {
      return request('DELETE', url);
    },
  };
})(window);
