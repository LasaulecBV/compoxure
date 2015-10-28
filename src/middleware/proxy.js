var HttpStatus = require('http-status-codes');
var url = require('url');
var utils = require('../utils');

module.exports = function backendProxyMiddleware(config, reliableGet, eventHandler) {
  return function (req, res, next) {
    req.tracer = req.headers['x-tracer'] || 'no-tracer';

    var options,
      backend = req.backend,
      targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
      host = backend.host || url.parse(backend.target).hostname,
      backendHeaders = {
        'x-forwarded-host': req.headers.host || 'no-forwarded-host',
        'x-forwarded-for': req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
        host: host,
        accept: backend.accept || 'text/html',
        'x-tracer': req.tracer,
        'user-agent': req.headers['user-agent'] || 'unknown',
        'x-device': req.templateVars['device:type'],
        'x-geoip-country-code': req.headers['x-geoip-country-code'],
        'x-csrf-token': req.headers['x-csrf-token']
      };

    if (config.cdn && config.cdn.url) {
      backendHeaders['x-cdn-url'] = config.cdn.url;
    }

    if (req.cookies && req.headers.cookie) {
      var whitelist = config.cookies && config.cookies.whitelist;
      backendHeaders.cookie = whitelist ? utils.filterCookies(whitelist, req.cookies) : req.headers.cookie;
    }

    if (req.headers['accept-language']) {
      backendHeaders['accept-language'] = req.headers['accept-language'];
    }

    if (backend.headers) {
      backend.headers.forEach(function (header) {
        backendHeaders[header] = req.headers[header] || '';
      });
    }

    eventHandler.logger('info', 'GET ' + req.url, {
      tracer: req.tracer,
      referer: req.headers.referer || 'direct',
      remoteIp: backendHeaders['x-forwarded-for'],
      userAgent: backendHeaders['user-agent']
    });

    options = {
      url: targetUrl,
      cacheKey: backend.cacheKey || utils.urlToCacheKey(targetUrl),
      cacheTTL: utils.timeToMillis(backend.ttl || '30s'),
      explicitNoCache: backend.noCache || req.explicitNoCache,
      timeout: utils.timeToMillis(backend.timeout || 5000),
      headers: backendHeaders,
      tracer: req.tracer,
      type: 'backend',
      statsdKey: 'backend_' + utils.urlToCacheKey(host),
      eventHandler: eventHandler
    };

    var logError = function (err, message) {
      var logLevel = err.statusCode === 404 ? 'warn' : 'error';
      eventHandler.logger(logLevel, message, {
        tracer: req.tracer
      });
    }

    var handleError = function (err, oldCacheData) {
      // Check to see if we have any statusCode handlers defined
      if (err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
        var handlerDefn = config.statusCodeHandlers[err.statusCode];
        var handlerFn = config.functions && config.functions[handlerDefn.fn];
        if (handlerFn) {
          return handlerFn(req, res, req.templateVars, handlerDefn.data, options, err);
        }
      }

      if (req.backend.quietFailure && oldCacheData) {
        req.templateVars = utils.updateTemplateVariables(req.templateVars, oldCacheData.headers);
        res.parse(oldCacheData.content);

        logError(err, 'Backend FAILED but serving STALE content from key ' + options.targetCacheKey + ' : ' + err.message);
      }
      else {
        if (!res.headersSent) {
          res.writeHead(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);
          res.end(err.message);
        }

        logError(err, 'Backend FAILED but to respond: ' + err.message);
      }
    }

    reliableGet.get(options, function (err, response) {
      if (err) {
        handleError(err, response);
      }
      else {
        req.templateVars = utils.updateTemplateVariables(req.templateVars, response.headers);

        if (response.headers['set-cookie']) {
          res.setHeader('set-cookie', response.headers['set-cookie']);
        }

        res.locals.responseData = response.content;
      }

      next();
    });
  }
}