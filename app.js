
/**
 * Module dependencies.
 */

var express = require('express')
  , RedisStore = require('connect-redis')(express)
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path');

var app = module.exports = express();

app.enable('trust proxy');

// AppFog

if ( process.env.VCAP_SERVICES ) {
  var service_type = 'redis-2.2';
  var json = JSON.parse(process.env.VCAP_SERVICES);
  var redis = json[service_type][0]['credentials'];
} else {
  var redis = {
    'host':'10.0.2.35',
    'port':6379,
    'password':''
  };
}

// Configuration

app.configure(function(){
  app.set('port', process.env.VCAP_APP_PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: 2592000000 }));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('66TT2ePxnN7mQAio2wdXAoEvX'));
  app.use(express.session({store: new RedisStore({host:redis['host'], port:redis['port'], pass:redis['password']})}));
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
