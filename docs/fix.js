// Custom domain fix - loaded by index.html when needed
(function(){if(window.location.hostname.includes('localhost'))return;var API_BASE='https://zhongyanling.xyz';var _f=window.fetch;window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/api/'))return _f(API_BASE+u,o);return _f(u,o)}})();
