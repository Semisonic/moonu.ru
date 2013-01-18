
/**
 * Module dependencies.
 */

var toobusy = require('toobusy')
  , express = require('express')
  , stylus = require('stylus')
  , RedisStore = require('connect-redis')(express)
  , bugsnag = require('bugsnag')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , redis = '';

var app = module.exports = express();

app.enable('trust proxy');

// middleware which blocks requests when we're too busy
app.use(function(req, res, next) {
  if (toobusy()) {
    res.send(503, 'Мы не справляемся с нагрузкой, попробуйте обновить страницу или зайти позже.');
  } else {
    next();
  }
});

// AppFog

if ( process.env.VCAP_SERVICES ) {
  var service_type = 'redis-2.2';
  var json = JSON.parse(process.env.VCAP_SERVICES);
  redis = json[service_type][0]['credentials'];
} else {
  redis = {
    'host':'10.0.2.35',
    'port':6379,
    'password':''
  };
}

// monitoring

var appfog = JSON.parse(process.env.VMC_APP_INSTANCE);
require('nodefly').profile(
    process.env.NODEFLY,
    ['moonu.ru',
     appfog.name,
     appfog.instance_index]
);

// Configuration

app.configure(function(){
  app.set('port', process.env.VCAP_APP_PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(bugsnag.register(process.env.BUGSNAG));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: 2592000000 }));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('66TT2ePxnN7mQAio2wdXAoEvX'));
  app.use(express.session({store: new RedisStore({host:redis['host'], port:redis['port'], pass:redis['password']})}));
  app.use(stylus.middleware({
      src: __dirname + '/styles',
      dest: __dirname + '/public/stylesheets',
      compile: function(str, path) {
          return stylus(str)
            .set('compress', true);
      }
  }));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

process.on('SIGINT', function() {
  server.close();
  // calling .shutdown allows your process to exit normally
  toobusy.shutdown();
  process.exit();
});