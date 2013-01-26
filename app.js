
/**
 * Module dependencies.
 */

var toobusy = require('toobusy')
  , express = require('express')
  , stylus = require('stylus')
  , everyauth = require('everyauth')
  , RedisStore = require('connect-redis')(express)
  , bugsnag = require('bugsnag')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , redis = '';

var app = module.exports = express();

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

// Set the CDN options

var options = {
    publicDir  : path.join(__dirname, '/public')
  , viewsDir   : path.join(__dirname, '/views')
  , domain     : 'cdn.moonu.ru'
  , bucket     : 'moonu'
  , endpoint   : 'moonu.s3-eu-west-1.amazonaws.com'
  , key        : process.env.AMAZON_S3_KEY
  , secret     : process.env.AMAZON_S3_SECRET
  , hostname   : 'localhost'
  , port       : 3000
  , ssl        : false
  // , production : true
};

// Initialize the CDN magic

var CDN = require('express-cdn')(app, options);

// Everyauth

//everyauth.debug = true;

var usersById = {};
var nextUserId = 0;

function addUser (source, sourceUser) {
  var user;
  if (arguments.length === 1) { // password-based
    user = sourceUser = source;
    user.id = ++nextUserId;
    return usersById[nextUserId] = user;
  } else { // non-password-based
    user = usersById[++nextUserId] = {id: nextUserId};
    user[source] = sourceUser;
  }
  return user;
}

var usersByYandexMoney = {};

everyauth.everymodule
  .findUserById( function (id, callback) {
    callback(null, usersById[id]);
  });

everyauth.yandexmoney
.appId(process.env.YAMONEY_APPID)
.appSecret(process.env.YAMONEY_APPSECRET)
.scope("account-info operation-history operation-details")
.findOrCreateUser( function(session, accessToken, accessTokenExtra, yaUser) {
    return usersByYandexMoney[yaUser.id] || (usersByYandexMoney[yaUser.id] = addUser('yandexmoney', yaUser));
  })
.redirectPath('/');

// Configuration

app.configure(function(){
  app.set('port', process.env.VCAP_APP_PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.enable('view cache');
  app.enable('trust proxy');
  app.use(bugsnag.register(process.env.BUGSNAG));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: 2592000000 }));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser(process.env.SECRET));
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

// Add the view helper

app.locals({ CDN: CDN() });

app.get('/', routes.index);
app.get('/transactions', routes.list);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

process.on('SIGINT', function() {
  server.close();
  // calling .shutdown allows your process to exit normally
  toobusy.shutdown();
  process.exit();
});