// GitHub Pages proxy fix - loaded by index.html
(function(){if(window.location.hostname.includes('localhost'))return;var _f=window.fetch;window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/api/'))return _f('https://corsproxy.io/?'+encodeURIComponent('https://workbuddy-production-706a.up.railway.app'+u),o);return _f(u,o)}})();
