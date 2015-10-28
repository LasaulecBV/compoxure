var parxer = require('parxer').parxer;
var parxerPlugins = require('parxer/Plugins');
var utils = require('../utils');

module.exports = function (config) {
  return function (req, res, next) {
    var data = res.locals.parsedData;
    delete res.locals.parsedData;

    var plugins = [
      parxerPlugins.Test,
      parxerPlugins.If,
      parxerPlugins.Image()
    ].concat(config.plugins || []);

    var options = {
      environment: config.environment,
      cdn: config.cdn,
      minified: config.minified,
      showErrors: !req.backend.quietFailure,
      timeout: utils.timeToMillis(req.backend.timeout || '5000'),
      plugins: plugins,
      variables: req.templateVars
    };

    var handler = function (err, content) {
      // Overall errors
      if (err && err.content) {
        if (!res.headersSent) {
          res.writeHead(err.statusCode || 500, { 'Content-Type': 'text/html' });
          return res.end(err.content)
        }
      }

      if (err.fragmentErrors) {
        // TODO: Notify fragment errors to debugger in future
      }

      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      }
    };

    parxer(options, data, handler);
  }
};
