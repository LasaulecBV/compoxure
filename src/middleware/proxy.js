var utils = require('../utils');
var HtmlParserProxy = require('./htmlparser');
var HttpStatus = require('http-status-codes');
var ReliableGet = require('reliable-get');
var url = require('url');
var _ = require('lodash');

module.exports = function backendProxyMiddleware(config, eventHandler) {

    var reliableGet = new ReliableGet(config),
        htmlParserMiddleware = HtmlParserProxy.getMiddleware(config, reliableGet, eventHandler);

    reliableGet.on('log', eventHandler.logger);
    reliableGet.on('stat', eventHandler.stats);

    return function(req, res) {

      htmlParserMiddleware(req, res, function() {

        req.tracer = req.headers['x-tracer'] || 'no-tracer';

        var DEFAULT_LOW_TIMEOUT = 5000,
            referer = req.headers.referer || 'direct',
            userAgent = req.headers['user-agent'] || 'unknown',
            remoteAddress = req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress,
            remoteIp = req.headers['x-forwarded-for'] || remoteAddress,
            backend = req.backend,
            targetUrl = backend.target + (backend.dontPassUrl ? '' : req.url),
            targetHost = url.parse(backend.target).hostname,
            host = backend.host || targetHost,
            backendHeaders = {
              'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host || 'no-forwarded-host',
              'x-forwarded-for': req.headers['x-forwarded-for'] || remoteAddress,
              host: host,
              'x-tracer': req.tracer
            },
            targetCacheTTL = utils.timeToMillis(backend.ttl || '30s'),
            explicitNoCache = backend.noCache || req.explicitNoCache,
            appendToUrl = backend.appendToUrl,
            options;
        if (appendToUrl) {
          _.forEach(appendToUrl, function(value, key) {
              if (targetUrl.indexOf(key) === -1) {
                  if (targetUrl.indexOf('?') === -1) {
                      targetUrl += '?';
                  } else {
                      targetUrl += '&';
                  }
                  targetUrl += key + '=' + utils.render(value, req.templateVars);
              }
          });
        }

        if (config.cdn && config.cdn.url) { backendHeaders['x-cdn-url'] = config.cdn.url; }

        if (req.cookies && req.headers.cookie) {
            var whitelist = config.cookies && config.cookies.whitelist;
            backendHeaders.cookie = whitelist ? utils.filterCookies(whitelist, req.cookies) : req.headers.cookie;
        }

        if (req.headers['accept-language']) {
          backendHeaders['accept-language'] = req.headers['accept-language'];
        }

        if(backend.headers){
            backend.headers.forEach(function(header) {
                backendHeaders[header] = req.headers[header] || '';
            });
        }

        var targetCacheKey = backend.cacheKey || utils.urlToCacheKey(targetUrl);

        eventHandler.logger('info', 'GET ' + req.url, {tracer: req.tracer, referer: referer, remoteIp: remoteIp, userAgent: userAgent});

        options = {
          url: targetUrl,
          cacheKey: targetCacheKey,
          cacheTTL: targetCacheTTL,
          explicitNoCache: explicitNoCache,
          timeout: utils.timeToMillis(backend.timeout || DEFAULT_LOW_TIMEOUT),
          headers: backendHeaders,
          tracer: req.tracer,
          type: 'backend',
          statsdKey: 'backend_' + utils.urlToCacheKey(host),
          eventHandler: eventHandler
        };

        var logError = function(err, message) {
           var logLevel = err.statusCode === 404 ? 'warn' : 'error';
           eventHandler.logger(logLevel, message, {
              tracer: req.tracer
           });
        }

        var handleError = function(err, oldCacheData) {

          // Check to see if we have any statusCode handlers defined
          if(err.statusCode && config.statusCodeHandlers && config.statusCodeHandlers[err.statusCode]) {
              var handlerDefn = config.statusCodeHandlers[err.statusCode];
              var handlerFn = config.functions && config.functions[handlerDefn.fn];
              if(handlerFn) {
                  return handlerFn(req, res, req.templateVars, handlerDefn.data, options, err);
              }
          }

          if (req.backend.quietFailure && oldCacheData) {
            req.templateVars = utils.updateTemplateVariables(req.templateVars, oldCacheData.headers);
            res.parse(oldCacheData.content);
            logError(err, 'Backend FAILED but serving STALE content: ' + err.message);
          } else {
            if (!res.headersSent) {
              res.writeHead(err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR);
              res.end(err.message);
            }
            logError(err, 'Backend FAILED but to respond: ' + err.message);
          }
        }

        reliableGet.get(options, function(err, response) {
          if(err) {
            handleError(err, response);
          } else {
            req.templateVars = utils.updateTemplateVariables(req.templateVars, response.headers);
            res.parse(response.content);
          }
        });

      });

    }
}
