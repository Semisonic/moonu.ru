
/**
 * Module dependencies.
 */

var toobusy = require('toobusy')
  , express = require('express')
  , stylus = require('stylus')
  , mongoose = require('mongoose')
  , RedisStore = require('connect-redis')(express)
  , rest = require('restler')
  , bugsnag = require('bugsnag')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , net = require('net')
  , redis;

var app = module.exports = express();

// bugsnag.register(process.env.BUGSNAG);

// middleware which blocks requests when we're too busy

app.use(function(req, res, next) {
  if (toobusy()) {
    res.send(503, 'Мы не справляемся с нагрузкой, попробуйте обновить страницу или зайти позже.');
  } else {
    next();
  }
});

// monitoring

// require('nodefly').profile(
//     process.env.NODEFLY,
//     ['moonu.ru']
// );

// Configuration

app.configure(function(){
  app.set('port', 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.enable('view cache');
  app.enable('trust proxy');
  app.use(bugsnag.requestHandler);
  app.use(bugsnag.errorHandler);
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: 2592000000 }));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser(process.env.SECRET));
  app.use(express.session({store: new RedisStore({host:'redis.robo38.com', port:'6379', pass:''})}));
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

// MongoDB

var Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

var Account = new Schema({
  user_id       : String,
  balance       : String,
  pub           : Number
});

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

Data = mongoose.model('Data', Data);

mongoose.connect('mongodb://mongodb.robo38.com/moonu');

//

function stdata(req){
  var accessToken = req.session.auth.yandexmoney.accessToken;
  shistory(accessToken,'0',req);
};

function shistory(accessToken,start,req) {
  rest.post('https://money.yandex.ru/api/operation-history', {
    query: {
       records: 2,
       start_record: start
      },
    headers: {
       'authorization': 'Bearer ' + accessToken,
       'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
       'Content-Length': '0'
      }
  }).on('success', function (data, res) {
    console.log(data);
        // Data.findOne({operation_id: data.operations[0].operation_id}, function(err, mtch) {
        //     if (!err) {
        //       if (mtch === null) {
        //         sdetails(accessToken,data,req);
        //         if (data.next_record) {
        //           shistory(accessToken,data.next_record,req);
        //         } else {
        //           return data;
        //         }
        //       }
        //     } else {
        //       res.send("error db");
        //       console.log(err);
        //     }
        //   });
    }).on('error', function (data, res) {
        console.log(data);
    });
};

// получаем детали транзакции
// function sdetails(accessToken,op_id,req) {
//   op_id.operations.every(function(e) {
//       rest.post('https://money.yandex.ru/api/operation-details', {
//         query: { operation_id: e.operation_id },
//             headers: {
//               'authorization': 'Bearer ' + accessToken,
//               'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
//               'Content-Length': '0'
//               }
//         }).on('success', function (data, res) {
//             Data.findOne({operation_id: e.operation_id}, function(err, mtch) {
//                 if (!err) {
//                   if (mtch === null) {
//                     var p = data.pattern_id || '';
//                     var s = data.sender || '';
//                     var r = data.recipient || '';
//                     var b = new Data();
//                     b.set({user_id:req.user.yandexmoney.id, operation_id:data.operation_id, pattern_id:p, datetime:data.datetime, title:data.title, direction:data.direction, amount:data.amount, sender:s, recipient:r});
//                     b.save(function (err) {
//                         if (!err) {
//                           console.log('Success save to db!');
//                         } else {
//                           console.log('Error on save! '+err);
//                         }
//                       });
//                     return data;
//                   }
//                 } else {
//                   res.send("error db");
//                   console.log(err);
//                 }
//               });
//         }).on('error', function (data, res) {
//             console.log('error api');
//             console.log(data);
//         });
//       return true;
//     });
// };

// Add the view helper

app.locals({
  rest: rest,
  context: context,
  shistory: shistory
});

app.get('/', routes.index);
app.get('/demo', routes.demo);
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