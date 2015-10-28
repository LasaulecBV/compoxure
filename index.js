var cookieParser = require('cookie-parser');
var ware = require('ware');
var ReliableGet = require('reliable-get');

module.exports = function(config, eventHandler) {

  eventHandler = eventHandler || {};
  eventHandler.logger = eventHandler.logger || function() {};
  eventHandler.stats = eventHandler.stats || function() {};

  var reliableGet = new ReliableGet(config)
  reliableGet.on('log', eventHandler.logger);
  reliableGet.on('stat', eventHandler.stats);

  var backendProxyMiddleware = require('./src/middleware/proxy')(config, reliableGet, eventHandler);
  var cacheMiddleware = require('reliable-get/CacheMiddleware')(config);
  var selectBackend = require('./src/middleware/backend')(config);
  var rejectUnsupportedMediaType = require('./src/middleware/mediatypes');
  var passThrough = require('./src/middleware/passthrough');
  var interrogateRequest = require('./src/middleware/interrorgator')(config, eventHandler);
  var cleanInvalidUri = require('./src/middleware/invalidurl')(eventHandler);
  var dropFavIcon = require('./src/middleware/favicon');
  var aggregateMiddleware = require('./src/middleware/aggregator')(config, reliableGet, eventHandler);
  var parserMiddleware = require('./src/middleware/htmlparser')(config, eventHandler);

  var middleware = ware()
                    .use(cleanInvalidUri)
                    .use(dropFavIcon)
                    .use(cacheMiddleware)
                    .use(interrogateRequest)
                    .use(selectBackend)
                    .use(rejectUnsupportedMediaType)
                    .use(passThrough)
                    .use(cookieParser)
                    .use(backendProxyMiddleware)
                    .use(aggregateMiddleware)
                    .use(parserMiddleware);

  return function(req, res) {
    middleware.run(req, res, function(err) {
        if(err) {
            // Just end fast - headers sent above if needed.
            res.end('');
        }
    });
  }

};
