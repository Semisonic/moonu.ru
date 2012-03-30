
/**
 * Module dependencies.
 */

var express = require('express'),
  stylus = require('stylus'),
  mongoose = require('mongoose'),
  everyauth = require('everyauth'),
  Db = require('mongodb').Db,
  Server = require('mongodb').Server,
  server_config = new Server('10.0.2.51', 27017, {auto_reconnect: true, native_parser: true}),
  db = new Db('moonu', server_config, {}),
  mongoStore = require('connect-mongodb'),
  rest = require('restler'),
  conf = require('../../shared/conf.js');

var app = module.exports = express.createServer();

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
.appId(conf.yandexmoney.appId)
.appSecret(conf.yandexmoney.appSecret)
.scope("account-info operation-history operation-details")
.findOrCreateUser( function(session, accessToken, accessTokenExtra, yaUser) {
    return usersByYandexMoney[yaUser.id] || (usersByYandexMoney[yaUser.id] = addUser('yandexmoney', yaUser));
  })
.redirectPath('/');

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({secret:conf.yandexmoney.secret, store:new mongoStore({db: db}), cookie: {maxAge: 3600000}}));
  app.use(express.methodOverride());
  app.use(everyauth.middleware());
  app.use(stylus.middleware({
      src: __dirname + '/views',
      dest: __dirname + '/public',
      compile: function(str, path) {
          return stylus(str)
            .set('compress', true)
            .set('filename', path);
        }
      }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

everyauth.helpExpress(app);

// MongoDB

var Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

var Data = new Schema({
  user_id       : String,
  operation_id  : String,
  pattern_id    : String,
  datetime      : Date,
  title         : String,
  direction     : String,
  amount        : Number,
  sender        : String,
  recipient     : String
});

var Data = mongoose.model('Data', Data);

mongoose.connect('mongodb://10.0.2.51/moonu');

//

function stdata(req){
  var accessToken = req.session.auth.yandexmoney.accessToken;
  shistory(accessToken,"0",req);
};

function sdetails(accessToken,op_id,req) {
  op_id.operations.every(function(e) {
      rest.post('https://money.yandex.ru/api/operation-details', {
        query: { operation_id: e.operation_id },
            headers: {
              'authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              'Content-Length': '0'
              }
        }).on('success', function (data, res) {
            Data.findOne({operation_id: e.operation_id}, function(err, mtch) {
                if (!err) {
                  if (mtch === null) {
                    var p = data.pattern_id || '';
                    var s = data.sender || '';
                    var r = data.recipient || '';
                    var b = new Data();
                    b.set({user_id:req.user.yandexmoney.id, operation_id:data.operation_id, pattern_id:p, datetime:data.datetime, title:data.title, direction:data.direction, amount:data.amount, sender:s, recipient:r});
                    b.save(function (err) {
                        if (!err) {
                          console.log('Success save to db!');
                        } else {
                          console.log('Error on save! '+err);
                        }
                      });
                    return data;
                  }
                } else {
                  res.send("error db");
                  console.log(err);
                }
              });
        }).on('error', function (data, res) {
            console.log('error api');
            console.log(data);
        });
      return true;
    });
};

function shistory(accessToken,start,req) {
  rest.post('https://money.yandex.ru/api/operation-history', {
    query: {
       records: 100,
       start_record: start
      },
    headers: {
       'authorization': 'Bearer ' + accessToken,
       'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
       'Content-Length': '0'
      }
    }).on('success', function (data, res) {
        Data.findOne({operation_id: data.operations[0].operation_id}, function(err, mtch) {
            if (!err) {
              if (mtch === null) {
                sdetails(accessToken,data,req);
                if (data.next_record) {
                  shistory(accessToken,data.next_record,req);
                } else {
                  return data;
                }
              }
            } else {
              res.send("error db");
              console.log(err);
            }
          });
    }).on('error', function (data, res) {
        console.log(data);
    });
};

// Routes
app.get('/', function(req, res){
  if (req.loggedIn) {
    stdata(req);
    res.render('stats', { title: 'Немного графиков для истории яндекс.денег' })
  } else {
    res.render('index', { title: 'Немного графиков для истории яндекс.денег' })
  }
});

app.get('/demo', function(req, res){
  res.render('demo', { title: 'Demo' })
});

app.get('/data/:id/in', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'in');
      query.where('user_id', req.params.id);
      query.sort('datetime',-1);
      query.exec (function (err, data) {
          var inm = [];
          var last = '';
          data.forEach(function(d){
              var date = new Date(d.datetime);
              var last_date = new Date(last.datetime);
              var now = date.getDate()+''+(date.getMonth()+1)+''+date.getFullYear();
              var last_time = last_date.getDate()+''+(last_date.getMonth()+1)+''+last_date.getFullYear();
              if (now === last_time) {
                inm.pop();
                inm.push({date:date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear(),in:d.amount+last.amount});
                last = d;
              } else {
                inm.push({date:date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear(),in:d.amount});
                last = d;
              }
            });
          res.json(inm);
        });
    } else {
      res.send("error");
    }
});

app.get('/data/:id/out', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'out');
      query.where('user_id', req.params.id);
      query.sort('datetime',-1);
      query.exec (function (err, data) {
          var out = [];
          var last = '';
          data.forEach(function(d){
              var date = new Date(d.datetime);
              var last_date = new Date(last.datetime);
              var now = date.getDate()+''+(date.getMonth()+1)+''+date.getFullYear();
              var last_time = last_date.getDate()+''+(last_date.getMonth()+1)+''+last_date.getFullYear();
              if (now === last_time) {
                out.pop();
                out.push({date:date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear(),out:d.amount+last.amount});
                last = d;
              } else {
                out.push({date:date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear(),out:d.amount});
                last = d;
              }
            });
          res.json(out);
        });
    } else {
      res.send("error");
    }
});

app.get('/data/:id/pie/out', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'out');
      query.where('user_id', req.params.id);
      query.sort('title',-1);
      query.exec (function (err, data) {
          var out = [];
          var last_title = '';
          var last_sum = 0;
          data.forEach(function(d){            
              if (d.title === last_title) {
                out.pop();
                out.push({out:d.amount+last_sum,title:d.title});
                last_title = d.title;
                last_sum = d.amount+last_sum;
              } else {
                out.push({out:d.amount,title:d.title});
                last_title = d.title;
                last_sum = d.amount;
              }
            });
          res.json(out);
        });
    } else {
      res.send("error");
    }
});

app.get('/data/:id/pie/in', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'in');
      query.where('user_id', req.params.id);
      query.sort('title',-1);
      query.exec (function (err, data) {
          var inm = [];
          var last_title = '';
          var last_sum = 0;
          data.forEach(function(d){            
              if (d.title === last_title) {
                inm.pop();
                inm.push({in:d.amount+last_sum,title:d.title});
                last_title = d.title;
                last_sum = d.amount+last_sum;
              } else {
                inm.push({in:d.amount,title:d.title});
                last_title = d.title;
                last_sum = d.amount;
              }
            });
          res.json(inm);
        });
    } else {
      res.send("error");
    }
});

app.get('/data/:id/table/out', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'out');
      query.where('user_id', req.params.id);
      query.sort('datetime',-1);
      query.exec (function (err, data) {
          var out = [];
          data.forEach(function(d){
              var date = new Date(d.datetime);
              var dateString = ('0' + date.getDate()).slice(-2) + '.' + ('0' + (date.getMonth()+1)).slice(-2) + '.' + date.getFullYear();
              out.push({date:dateString,out:d.amount,title:d.title});
            });
          res.json(out);
        });
    } else {
      res.send("error");
    }
});

app.get('/data/:id/table/in', function(req, res){
    if (req.loggedIn) {
      var query = Data.find({});
      query.where('direction', 'in');
      query.where('user_id', req.params.id);
      query.sort('datetime',-1);
      query.exec (function (err, data) {
          var inm = [];
          data.forEach(function(d){
              var date = new Date(d.datetime);
              var dateString = ('0' + date.getDate()).slice(-2) + '.' + ('0' + (date.getMonth()+1)).slice(-2) + '.' + date.getFullYear();
              inm.push({date:dateString,in:d.amount,title:d.title});
            });
          res.json(inm);
        });
    } else {
      res.send("error");
    }
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
